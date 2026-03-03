pub mod model;
pub mod resampler;
pub mod worker;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use std::path::PathBuf;

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::ipc::Channel;

pub struct TranscriptionState {
    pub worker_handle: Option<JoinHandle<()>>,
    pub forwarder_handle: Option<JoinHandle<()>>,
    pub audio_tx: Option<mpsc::SyncSender<Vec<f32>>>,
    pub command_tx: Option<mpsc::Sender<WorkerCommand>>,
    pub shutdown: Arc<AtomicBool>,
}

#[derive(Debug)]
pub enum WorkerCommand {
    Flush,
    Shutdown,
}

#[derive(Clone, Debug)]
pub struct SegmentResult {
    pub text: String,
    pub elapsed_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum TranscriptEvent {
    Segment {
        text: String,
        elapsed_ms: u64,
        index: u32,
    },
    Transcribing {
        active: bool,
    },
}

impl Default for TranscriptionState {
    fn default() -> Self {
        Self {
            worker_handle: None,
            forwarder_handle: None,
            audio_tx: None,
            command_tx: None,
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn join_with_timeout(handle: JoinHandle<()>, timeout: Duration) -> bool {
    let (joined_tx, joined_rx) = mpsc::channel::<()>();

    thread::spawn(move || {
        let _ = handle.join();
        let _ = joined_tx.send(());
    });

    joined_rx.recv_timeout(timeout).is_ok()
}

pub fn start_transcription_worker(
    state: &mut TranscriptionState,
    audio_tx: mpsc::SyncSender<Vec<f32>>,
    audio_rx: mpsc::Receiver<Vec<f32>>,
    on_segment: Channel<TranscriptEvent>,
    data_dir: PathBuf,
    db_pool: Option<SqlitePool>,
    meeting_id: Option<i64>,
    on_worker_disconnected: Option<Arc<dyn Fn() + Send + Sync>>,
    language: Option<String>,
) -> Result<(), String> {
    let normalized_language = model::normalize_language(language.as_deref());

    if !model::check_model_ready(data_dir.as_path(), Some(normalized_language.as_str())) {
        return Err("transcription model is not ready; download required model files first".to_string());
    }

    if state.worker_handle.is_some() {
        return Ok(());
    }

    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>();
    let (result_tx, result_rx) = mpsc::channel::<SegmentResult>();
    let vad_model = model::vad_model_path(data_dir.as_path());
    let resolved_model = model::resolve_model(data_dir.as_path(), Some(normalized_language.as_str()));

    let config = worker::WorkerConfig {
        backend: resolved_model.backend,
        vad_model: vad_model.to_string_lossy().to_string(),
        asr_encoder: resolved_model
            .encoder_path
            .to_string_lossy()
            .to_string(),
        asr_decoder: resolved_model
            .decoder_path
            .to_string_lossy()
            .to_string(),
        asr_joiner: resolved_model
            .joiner_path
            .map(|path| path.to_string_lossy().to_string()),
        asr_tokens: resolved_model
            .tokens_path
            .to_string_lossy()
            .to_string(),
        recording_start_ms: 0,
        result_tx,
        language: normalized_language,
    };

    let worker_shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_for_worker = worker_shutdown.clone();
    let shutdown_for_state = worker_shutdown.clone();
    let shutdown_for_forwarder = worker_shutdown.clone();

    let worker_handle = thread::Builder::new()
        .name("transcription-worker".to_string())
        .spawn(move || {
            worker::run_worker(audio_rx, command_rx, config, shutdown_for_worker);
        })
        .map_err(|err| format!("failed to spawn transcription worker: {err}"))?;

    let pool_for_forwarder = db_pool.clone();
    let meeting_for_forwarder = meeting_id;
    let on_worker_disconnected_for_forwarder = on_worker_disconnected.clone();

    let forwarder_handle = thread::Builder::new()
        .name("transcription-forwarder".to_string())
        .spawn(move || {
            let mut segment_index = 0u32;
            let _ = on_segment.send(TranscriptEvent::Transcribing { active: true });

            loop {
                let segment = match result_rx.recv() {
                    Ok(segment) => segment,
                    Err(_) => {
                        if !shutdown_for_forwarder.load(Ordering::SeqCst) {
                            if let Some(callback) = &on_worker_disconnected_for_forwarder {
                                callback();
                            }
                        }
                        break;
                    }
                };

                let text = segment.text.trim().to_string();
                if text.is_empty() {
                    continue;
                }

                let _ = on_segment.send(TranscriptEvent::Segment {
                    text: text.clone(),
                    elapsed_ms: segment.elapsed_ms,
                    index: segment_index,
                });

                if let (Some(pool), Some(mid)) = (&pool_for_forwarder, meeting_for_forwarder) {
                    let pool_clone = pool.clone();
                    let text_clone = text.clone();
                    let index = i64::from(segment_index);
                    let elapsed_ms = segment.elapsed_ms as i64;
                    tauri::async_runtime::spawn(async move {
                        if let Err(err) = sqlx::query(
                            "INSERT INTO transcripts (meeting_id, segment_index, text, start_time_ms, end_time_ms, is_final)
                             VALUES (?, ?, ?, ?, ?, 1)",
                        )
                        .bind(mid)
                        .bind(index)
                        .bind(text_clone)
                        .bind(elapsed_ms)
                        .bind(elapsed_ms + 1000)
                        .execute(&pool_clone)
                        .await
                        {
                            eprintln!("failed to checkpoint transcript segment: {err}");
                        }
                    });
                }

                segment_index = segment_index.saturating_add(1);
            }

            let _ = on_segment.send(TranscriptEvent::Transcribing { active: false });
        })
        .map_err(|err| format!("failed to spawn transcription forwarder: {err}"))?;

    state.shutdown = shutdown_for_state;
    state.worker_handle = Some(worker_handle);
    state.forwarder_handle = Some(forwarder_handle);
    state.audio_tx = Some(audio_tx);
    state.command_tx = Some(command_tx);

    Ok(())
}

pub fn stop_transcription_worker(state: &mut TranscriptionState) {
    state.shutdown.store(true, Ordering::SeqCst);

    if let Some(command_tx) = state.command_tx.take() {
        let _ = command_tx.send(WorkerCommand::Shutdown);
    }

    state.audio_tx.take();

    if let Some(handle) = state.worker_handle.take() {
        if !join_with_timeout(handle, Duration::from_secs(3)) {
            eprintln!("timed out waiting for transcription worker to join");
        }
    }

    if let Some(handle) = state.forwarder_handle.take() {
        if !join_with_timeout(handle, Duration::from_secs(3)) {
            eprintln!("timed out waiting for transcription forwarder to join");
        }
    }

    state.shutdown.store(false, Ordering::SeqCst);
}

pub fn flush_transcription(state: &TranscriptionState) {
    if let Some(command_tx) = &state.command_tx {
        let _ = command_tx.send(WorkerCommand::Flush);
    }
}
