use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;

use sherpa_rs::silero_vad::{SileroVad, SileroVadConfig};
use sherpa_rs::transducer::TransducerConfig;
use sherpa_rs::whisper::{WhisperConfig, WhisperRecognizer};

use super::safe_recognizer::SafeTransducerRecognizer;

use super::model::AsrBackend;
use super::resampler::{AudioResampler, RingAccumulator};
use super::{SegmentResult, WorkerCommand};

pub struct WorkerConfig {
    pub backend: AsrBackend,
    pub vad_model: String,
    pub asr_encoder: String,
    pub asr_decoder: String,
    pub asr_joiner: Option<String>,
    pub asr_tokens: String,
    pub recording_start_ms: u64,
    pub result_tx: mpsc::Sender<SegmentResult>,
    pub language: String,
}

enum TranscriptionRecognizer {
    Transducer(SafeTransducerRecognizer),
    Whisper(WhisperRecognizer),
}

impl TranscriptionRecognizer {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> String {
        match self {
            Self::Transducer(recognizer) => recognizer.transcribe(sample_rate, samples),
            Self::Whisper(recognizer) => recognizer.transcribe(sample_rate, samples).text,
        }
    }
}

fn process_completed_segments(
    vad: &mut SileroVad,
    recognizer: &mut TranscriptionRecognizer,
    result_tx: &mpsc::Sender<SegmentResult>,
    recording_start_ms: u64,
) {
    while !vad.is_empty() {
        let segment = vad.front();
        let text = recognizer.transcribe(16_000, &segment.samples).trim().to_string();

        if !text.is_empty() {
            let segment_elapsed_ms = ((segment.start.max(0) as u64) * 1000) / 16_000;
            let elapsed_ms = recording_start_ms.saturating_add(segment_elapsed_ms);
            let _ = result_tx.send(SegmentResult { text, elapsed_ms });
        }

        vad.pop();
    }
}

pub fn run_worker(
    audio_rx: mpsc::Receiver<Vec<f32>>,
    command_rx: mpsc::Receiver<WorkerCommand>,
    config: WorkerConfig,
    shutdown: Arc<AtomicBool>,
) {
    eprintln!(
        "[transcription] worker started, backend={:?}, language={}",
        config.backend, config.language
    );

    eprintln!("[transcription] creating audio resampler...");
    let mut resampler = match AudioResampler::new(48_000, 16_000, 1_536) {
        Ok(resampler) => resampler,
        Err(err) => {
            eprintln!("failed to create audio resampler: {err}");
            return;
        }
    };

    let mut ring = RingAccumulator::new(1_536);

    eprintln!("[transcription] loading VAD model: {}", config.vad_model);
    let mut vad = match SileroVad::new(
        SileroVadConfig {
            model: config.vad_model.clone(),
            window_size: 512,
            min_silence_duration: 1.2,
            min_speech_duration: 0.15,
            max_speech_duration: 30.0,
            threshold: 0.45,
            sample_rate: 16_000,
            ..Default::default()
        },
        30.0,
    ) {
        Ok(vad) => vad,
        Err(err) => {
            eprintln!("failed to initialize Silero VAD: {err}");
            return;
        }
    };
    eprintln!("[transcription] VAD loaded OK");

    let mut recognizer = match config.backend {
        AsrBackend::ParakeetTransducer => {
            let joiner = match &config.asr_joiner {
                Some(path) => path.clone(),
                None => {
                    eprintln!("missing joiner model path for parakeet transducer backend");
                    return;
                }
            };

            eprintln!(
                "[transcription] loading transducer — encoder={}, decoder={}, joiner={}, tokens={}",
                config.asr_encoder, config.asr_decoder, joiner, config.asr_tokens
            );
            match SafeTransducerRecognizer::new(TransducerConfig {
                decoder: config.asr_decoder.clone(),
                encoder: config.asr_encoder.clone(),
                joiner,
                tokens: config.asr_tokens.clone(),
                model_type: "nemo_transducer".to_string(),
                num_threads: 2,
                sample_rate: 16_000,
                feature_dim: 80,
                provider: Some("cpu".to_string()),
                debug: false,
                ..Default::default()
            }) {
                Ok(recognizer) => {
                    eprintln!("[transcription] transducer loaded OK");
                    TranscriptionRecognizer::Transducer(recognizer)
                }
                Err(err) => {
                    eprintln!("failed to initialize transducer recognizer: {err}");
                    return;
                }
            }
        }
        AsrBackend::Whisper => {
            eprintln!(
                "[transcription] loading whisper — encoder={}, decoder={}, tokens={}",
                config.asr_encoder, config.asr_decoder, config.asr_tokens
            );
            match WhisperRecognizer::new(WhisperConfig {
                encoder: config.asr_encoder.clone(),
                decoder: config.asr_decoder.clone(),
                tokens: config.asr_tokens.clone(),
                language: config.language.clone(),
                num_threads: Some(2),
                provider: Some("cpu".to_string()),
                ..Default::default()
            }) {
                Ok(recognizer) => {
                    eprintln!("[transcription] whisper loaded OK");
                    TranscriptionRecognizer::Whisper(recognizer)
                }
                Err(err) => {
                    eprintln!("failed to initialize whisper recognizer: {err}");
                    return;
                }
            }
        }
    };

    while !shutdown.load(Ordering::Relaxed) {
        match command_rx.try_recv() {
            Ok(WorkerCommand::Flush) => {
                vad.flush();
                process_completed_segments(
                    &mut vad,
                    &mut recognizer,
                    &config.result_tx,
                    config.recording_start_ms,
                );
            }
            Ok(WorkerCommand::Shutdown) => break,
            Err(mpsc::TryRecvError::Disconnected) => break,
            Err(mpsc::TryRecvError::Empty) => {}
        }

        match audio_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(chunk) => {
                ring.push(&chunk);
                for chunk_48k in ring.drain_chunks() {
                    let chunk_16k = match resampler.process(&chunk_48k) {
                        Ok(chunk_16k) => chunk_16k,
                        Err(err) => {
                            eprintln!("resampling failed: {err}");
                            continue;
                        }
                    };

                    // sherpa-rs expects an owned Vec<f32> for VAD input.
                    vad.accept_waveform(chunk_16k);
                    process_completed_segments(
                        &mut vad,
                        &mut recognizer,
                        &config.result_tx,
                        config.recording_start_ms,
                    );
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    vad.flush();
    process_completed_segments(
        &mut vad,
        &mut recognizer,
        &config.result_tx,
        config.recording_start_ms,
    );
}
