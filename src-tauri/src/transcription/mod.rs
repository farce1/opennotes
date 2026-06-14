pub mod engine;
pub mod model;
pub mod resampler;
pub mod worker;

use std::path::{Path, PathBuf};
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
    pub asr_engine_preference: Option<String>,
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

/// A transcript row ready for insertion, derived from transcription segments.
#[derive(Debug, PartialEq)]
pub struct TranscriptInsert {
    pub segment_index: i64,
    pub text: String,
    pub start_time_ms: i64,
    pub end_time_ms: i64,
}

/// Approximate spoken span assigned to each segment (matches the live worker).
const SEGMENT_SPAN_MS: i64 = 1_000;

pub fn transcript_rows(segments: &[SegmentResult]) -> Vec<TranscriptInsert> {
    segments
        .iter()
        .enumerate()
        .map(|(index, segment)| {
            let start_time_ms = segment.elapsed_ms as i64;
            TranscriptInsert {
                segment_index: index as i64,
                text: segment.text.clone(),
                start_time_ms,
                end_time_ms: start_time_ms + SEGMENT_SPAN_MS,
            }
        })
        .collect()
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

fn resolve_asr_engine(preference: Option<&str>, data_dir: &Path) -> (String, PathBuf) {
    // Explicit Whisper always wins; otherwise prefer Parakeet when its model is present.
    let use_parakeet =
        preference != Some("whisper") && model::check_parakeet_assets_ready(data_dir);
    if use_parakeet {
        ("parakeet".to_string(), model::parakeet_model_dir(data_dir))
    } else {
        ("whisper".to_string(), model::whisper_turbo_model_dir(data_dir))
    }
}

/// Re-transcribe a saved recording end-to-end and return its segments. Returns an
/// error (leaving any existing transcript untouched) when the model is missing or
/// the run yields no speech, so a re-transcription never silently wipes a transcript.
pub fn retranscribe_audio_file(
    data_dir: &Path,
    audio_path: &Path,
) -> Result<Vec<SegmentResult>, String> {
    let (asr_engine, model_dir) = resolve_asr_engine(None, data_dir);

    if !model::check_engine_ready(&asr_engine, data_dir) {
        return Err("transcription model is not ready; download required model files first".to_string());
    }

    let samples_48k = crate::diarization::decode::decode_ogg_opus_to_f32(audio_path)?;
    let vad_model = model::vad_model_path(data_dir).to_string_lossy().to_string();
    let segments = worker::transcribe_samples_48k(&samples_48k, model_dir, asr_engine, vad_model);

    if segments.is_empty() {
        return Err(
            "re-transcription produced no transcript; the existing transcript was left unchanged"
                .to_string(),
        );
    }

    Ok(segments)
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
        asr_engine_preference,
    } = args;

    let (asr_engine, model_dir) =
        resolve_asr_engine(asr_engine_preference.as_deref(), data_dir.as_path());

    if !model::check_engine_ready(&asr_engine, data_dir.as_path()) {
        return Err("transcription model is not ready; download required model files first".to_string());
    }

    if state.worker_handle.is_some() {
        return Ok(());
    }

    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>();
    let (result_tx, result_rx) = mpsc::channel::<SegmentResult>();
    let vad_model = model::vad_model_path(data_dir.as_path());

    let config = worker::WorkerConfig {
        model_dir,
        asr_engine,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_honors_explicit_preference_then_availability() {
        let tmp = std::env::temp_dir().join(format!("on-engine-sel-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);

        let whisper_dir = model::whisper_turbo_model_dir(&tmp);
        let parakeet_dir = model::parakeet_model_dir(&tmp);

        // Nothing downloaded: availability and explicit whisper both pick whisper;
        // explicit parakeet falls back to availability (whisper) since its model is absent.
        assert_eq!(resolve_asr_engine(None, &tmp).0, "whisper");
        assert_eq!(resolve_asr_engine(Some("whisper"), &tmp).0, "whisper");
        assert_eq!(resolve_asr_engine(Some("parakeet"), &tmp).0, "whisper");

        std::fs::create_dir_all(&parakeet_dir).unwrap();
        for f in [
            "encoder.int8.onnx",
            "decoder.int8.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
        ] {
            std::fs::write(parakeet_dir.join(f), b"x").unwrap();
        }

        // No preference -> availability prefers parakeet when present.
        let (engine, dir) = resolve_asr_engine(None, &tmp);
        assert_eq!(engine, "parakeet");
        assert_eq!(dir, parakeet_dir);

        // Explicit whisper wins even though parakeet is present.
        let (engine, dir) = resolve_asr_engine(Some("whisper"), &tmp);
        assert_eq!(engine, "whisper");
        assert_eq!(dir, whisper_dir);

        // Explicit parakeet with its model present.
        assert_eq!(resolve_asr_engine(Some("parakeet"), &tmp).0, "parakeet");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn transcript_rows_assigns_sequential_indices_and_padded_end_times() {
        let segments = vec![
            SegmentResult {
                text: "hello".to_string(),
                elapsed_ms: 0,
                detected_language: None,
            },
            SegmentResult {
                text: "world".to_string(),
                elapsed_ms: 2_500,
                detected_language: Some("en".to_string()),
            },
        ];

        let rows = transcript_rows(&segments);

        assert_eq!(
            rows,
            vec![
                TranscriptInsert {
                    segment_index: 0,
                    text: "hello".to_string(),
                    start_time_ms: 0,
                    end_time_ms: 1_000,
                },
                TranscriptInsert {
                    segment_index: 1,
                    text: "world".to_string(),
                    start_time_ms: 2_500,
                    end_time_ms: 3_500,
                },
            ]
        );
    }
}
