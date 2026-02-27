pub mod model;
pub mod resampler;
pub mod worker;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;
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
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
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
) -> Result<(), String> {
    if !model::check_model_ready() {
        return Err("transcription model is not ready; download required model files first".to_string());
    }

    if state.worker_handle.is_some() {
        return Ok(());
    }

    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>();
    let (result_tx, result_rx) = mpsc::channel::<SegmentResult>();

    let config = worker::WorkerConfig {
        vad_model: model::vad_model_path().to_string_lossy().to_string(),
        asr_encoder: model::parakeet_model_dir()
            .join("encoder.int8.onnx")
            .to_string_lossy()
            .to_string(),
        asr_decoder: model::parakeet_model_dir()
            .join("decoder.int8.onnx")
            .to_string_lossy()
            .to_string(),
        asr_joiner: model::parakeet_model_dir()
            .join("joiner.int8.onnx")
            .to_string_lossy()
            .to_string(),
        asr_tokens: model::parakeet_model_dir()
            .join("tokens.txt")
            .to_string_lossy()
            .to_string(),
        recording_start_ms: 0,
        result_tx,
    };

    let worker_shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_for_worker = worker_shutdown.clone();
    let shutdown_for_state = worker_shutdown.clone();

    let worker_handle = thread::Builder::new()
        .name("transcription-worker".to_string())
        .spawn(move || {
            worker::run_worker(audio_rx, command_rx, config, shutdown_for_worker);
        })
        .map_err(|err| format!("failed to spawn transcription worker: {err}"))?;

    let forwarder_handle = thread::Builder::new()
        .name("transcription-forwarder".to_string())
        .spawn(move || {
            let mut segment_index = 0u32;
            let _ = on_segment.send(TranscriptEvent::Transcribing { active: true });

            while let Ok(segment) = result_rx.recv() {
                let text = segment.text.trim().to_string();
                if text.is_empty() {
                    continue;
                }

                let _ = on_segment.send(TranscriptEvent::Segment {
                    text,
                    elapsed_ms: segment.elapsed_ms,
                    index: segment_index,
                });
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
        if !join_with_timeout(handle, Duration::from_secs(2)) {
            eprintln!("timed out waiting for transcription worker to join");
        }
    }

    if let Some(handle) = state.forwarder_handle.take() {
        if !join_with_timeout(handle, Duration::from_secs(2)) {
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
