pub mod model;
pub mod resampler;
pub mod worker;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::Duration;

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

pub struct StartWorkerArgs {
    pub audio_tx: mpsc::SyncSender<Vec<f32>>,
    pub audio_rx: mpsc::Receiver<Vec<f32>>,
    pub on_segment: Channel<TranscriptEvent>,
    pub data_dir: PathBuf,
    pub db_pool: Option<SqlitePool>,
    pub meeting_id: Option<i64>,
    pub on_worker_disconnected: Option<Arc<dyn Fn() + Send + Sync>>,
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
    pub detected_language: Option<String>,
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
    args: StartWorkerArgs,
) -> Result<(), String> {
    let StartWorkerArgs {
        audio_tx,
        audio_rx,
        on_segment,
        data_dir,
        db_pool,
        meeting_id,
        on_worker_disconnected,
    } = args;

    if !model::check_model_ready(data_dir.as_path()) {
        return Err("transcription model is not ready; download required model files first".to_string());
    }

    if state.worker_handle.is_some() {
        return Ok(());
    }

    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>();
    let (result_tx, result_rx) = mpsc::channel::<SegmentResult>();
    let vad_model = model::vad_model_path(data_dir.as_path());

    let config = worker::WorkerConfig {
        model_dir: model::whisper_turbo_model_dir(data_dir.as_path()),
        vad_model: vad_model.to_string_lossy().to_string(),
        recording_start_ms: 0,
        result_tx,
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
    let models_dir_for_cleanup = model::models_dir(data_dir.as_path());

    let forwarder_handle = thread::Builder::new()
        .name("transcription-forwarder".to_string())
        .spawn(move || {
            let mut segment_index = 0u32;
            let mut language_written = false;
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

                if !language_written {
                    if let Some(detected_language) = segment
                        .detected_language
                        .as_deref()
                        .map(str::trim)
                        .filter(|lang| !lang.is_empty())
                        .map(|lang| lang.to_string())
                    {
                        language_written = true;

                        if let (Some(pool), Some(mid)) = (&pool_for_forwarder, meeting_for_forwarder) {
                            let pool_clone = pool.clone();
                            let models_dir_clone = models_dir_for_cleanup.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(err) = sqlx::query(
                                    "UPDATE meetings SET detected_language = ?, asr_engine = 'whisper' WHERE id = ?",
                                )
                                .bind(&detected_language)
                                .bind(mid)
                                .execute(&pool_clone)
                                .await
                                {
                                    eprintln!("failed to persist detected language: {err}");
                                    return;
                                }

                                let parakeet_dir =
                                    models_dir_clone.join("sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8");
                                if parakeet_dir.exists() {
                                    match std::fs::remove_dir_all(&parakeet_dir) {
                                        Ok(_) => {
                                            eprintln!(
                                                "[transcription] removed legacy parakeet model dir: {}",
                                                parakeet_dir.display()
                                            );
                                        }
                                        Err(err) => {
                                            eprintln!(
                                                "[transcription] failed to remove legacy parakeet model dir {}: {err}",
                                                parakeet_dir.display()
                                            );
                                        }
                                    }
                                }

                                let whisper_tiny_dir = models_dir_clone.join("sherpa-onnx-whisper-tiny");
                                if whisper_tiny_dir.exists() {
                                    match std::fs::remove_dir_all(&whisper_tiny_dir) {
                                        Ok(_) => {
                                            eprintln!(
                                                "[transcription] removed legacy whisper-tiny model dir: {}",
                                                whisper_tiny_dir.display()
                                            );
                                        }
                                        Err(err) => {
                                            eprintln!(
                                                "[transcription] failed to remove legacy whisper-tiny model dir {}: {err}",
                                                whisper_tiny_dir.display()
                                            );
                                        }
                                    }
                                }
                            });
                        }
                    }
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
