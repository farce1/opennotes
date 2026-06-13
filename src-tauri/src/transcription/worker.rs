use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;

use sherpa_rs::silero_vad::{SileroVad, SileroVadConfig};
use sherpa_rs::whisper::{WhisperConfig, WhisperRecognizer};

use super::resampler::{AudioResampler, RingAccumulator};
use super::{SegmentResult, WorkerCommand};

const ASR_SAMPLE_RATE: u32 = 16_000;
const WHISPER_MAX_DECODE_SECONDS: usize = 25;
const WHISPER_MAX_DECODE_SAMPLES: usize = (ASR_SAMPLE_RATE as usize) * WHISPER_MAX_DECODE_SECONDS;

fn samples_to_ms(num_samples: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    num_samples.saturating_mul(1000) / u64::from(sample_rate)
}

fn build_segment_result(
    text: String,
    detected_language: Option<String>,
    recording_start_ms: u64,
    segment_start_samples: u64,
    chunk_offset_samples: u64,
    chunk_len_samples: usize,
    sample_rate: u32,
) -> SegmentResult {
    let start_samples = segment_start_samples.saturating_add(chunk_offset_samples);
    let elapsed_ms = recording_start_ms.saturating_add(samples_to_ms(start_samples, sample_rate));
    let duration_ms = samples_to_ms(chunk_len_samples as u64, sample_rate);

    SegmentResult {
        text,
        elapsed_ms,
        duration_ms,
        detected_language,
    }
}

pub struct WorkerConfig {
    pub model_dir: PathBuf,
    pub vad_model: String,
    pub recording_start_ms: u64,
    pub result_tx: mpsc::Sender<SegmentResult>,
}

fn process_completed_segments(
    vad: &mut SileroVad,
    recognizer: &mut WhisperRecognizer,
    result_tx: &mpsc::Sender<SegmentResult>,
    recording_start_ms: u64,
) {
    while !vad.is_empty() {
        let segment = vad.front();
        let max_decode_samples = WHISPER_MAX_DECODE_SAMPLES.max(1);
        let segment_start_samples = segment.start.max(0) as u64;

        for (chunk_index, samples) in segment.samples.chunks(max_decode_samples).enumerate() {
            if samples.is_empty() {
                continue;
            }

            let result = recognizer.transcribe(ASR_SAMPLE_RATE, samples);
            let text = result.text.trim().to_string();
            if text.is_empty() {
                continue;
            }

            let lang = result.lang.trim();
            let detected_language = if lang.is_empty() {
                None
            } else {
                Some(lang.to_string())
            };

            let chunk_offset_samples = (chunk_index as u64) * (max_decode_samples as u64);
            let segment_result = build_segment_result(
                text,
                detected_language,
                recording_start_ms,
                segment_start_samples,
                chunk_offset_samples,
                samples.len(),
                ASR_SAMPLE_RATE,
            );

            let _ = result_tx.send(segment_result);
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
        "[transcription] worker started, model_dir={}",
        config.model_dir.display()
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

    eprintln!(
        "[transcription] loading VAD model: {} (max_speech_duration=10s)",
        config.vad_model
    );
    let mut vad = match SileroVad::new(
        SileroVadConfig {
            model: config.vad_model.clone(),
            window_size: 512,
            min_silence_duration: 1.2,
            min_speech_duration: 0.15,
            max_speech_duration: 10.0,
            threshold: 0.45,
            sample_rate: ASR_SAMPLE_RATE,
            ..Default::default()
        },
        60.0,
    ) {
        Ok(vad) => vad,
        Err(err) => {
            eprintln!("failed to initialize Silero VAD: {err}");
            return;
        }
    };
    eprintln!("[transcription] VAD loaded OK");

    let asr_encoder = config.model_dir.join("turbo-encoder.int8.onnx");
    let asr_decoder = config.model_dir.join("turbo-decoder.int8.onnx");
    let asr_tokens = config.model_dir.join("turbo-tokens.txt");

    eprintln!(
        "[transcription] loading whisper turbo — encoder={}, decoder={}, tokens={}",
        asr_encoder.display(),
        asr_decoder.display(),
        asr_tokens.display()
    );

    let mut recognizer = match WhisperRecognizer::new(WhisperConfig {
        encoder: asr_encoder.to_string_lossy().to_string(),
        decoder: asr_decoder.to_string_lossy().to_string(),
        tokens: asr_tokens.to_string_lossy().to_string(),
        language: "".to_string(),
        num_threads: Some(2),
        provider: Some("cpu".to_string()),
        debug: false,
        ..Default::default()
    }) {
        Ok(recognizer) => {
            eprintln!("[transcription] whisper turbo loaded OK");
            recognizer
        }
        Err(err) => {
            eprintln!("failed to initialize whisper recognizer: {err}");
            return;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_to_ms_converts_at_16khz() {
        assert_eq!(samples_to_ms(16_000, 16_000), 1_000);
        assert_eq!(samples_to_ms(8_000, 16_000), 500);
        assert_eq!(samples_to_ms(0, 16_000), 0);
    }

    #[test]
    fn samples_to_ms_guards_zero_sample_rate() {
        assert_eq!(samples_to_ms(16_000, 0), 0);
    }

    #[test]
    fn build_segment_result_uses_real_duration_not_fixed_span() {
        // 2-second chunk (32000 samples @ 16kHz) starting 1s into the recording.
        let result = build_segment_result(
            "hello".to_string(),
            Some("en".to_string()),
            0,
            16_000,
            0,
            32_000,
            16_000,
        );

        assert_eq!(result.elapsed_ms, 1_000);
        // Regression guard: real duration, not the old hardcoded 1000ms span.
        assert_eq!(result.duration_ms, 2_000);
        assert_eq!(result.text, "hello");
        assert_eq!(result.detected_language.as_deref(), Some("en"));
    }

    #[test]
    fn build_segment_result_applies_chunk_offset_and_recording_start() {
        // Second 25s chunk (offset 400000 samples), recording started at 5000ms.
        let result = build_segment_result(
            "world".to_string(),
            None,
            5_000,
            0,
            400_000,
            16_000,
            16_000,
        );

        assert_eq!(result.elapsed_ms, 5_000 + 25_000);
        assert_eq!(result.duration_ms, 1_000);
    }
}
