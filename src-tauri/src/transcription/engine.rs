use std::path::Path;

use sherpa_rs::whisper::{WhisperConfig, WhisperRecognizer};

/// Result of one ASR call: recognized text plus the detected language
/// (empty string when the engine does not report one).
pub struct AsrOutput {
    pub text: String,
    pub language: String,
}

/// A speech-to-text engine that transcribes 16 kHz mono f32 samples.
///
/// The VAD -> chunk -> transcribe loop in `worker.rs` is engine-agnostic, so new
/// engines (e.g. Parakeet) only need to implement this trait.
pub trait AsrEngine {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> AsrOutput;
}

/// Whisper large-v3-turbo (int8) via sherpa-onnx.
pub struct WhisperEngine {
    recognizer: WhisperRecognizer,
}

impl WhisperEngine {
    pub fn load(model_dir: &Path) -> Result<Self, String> {
        let recognizer = WhisperRecognizer::new(WhisperConfig {
            encoder: model_dir
                .join("turbo-encoder.int8.onnx")
                .to_string_lossy()
                .to_string(),
            decoder: model_dir
                .join("turbo-decoder.int8.onnx")
                .to_string_lossy()
                .to_string(),
            tokens: model_dir
                .join("turbo-tokens.txt")
                .to_string_lossy()
                .to_string(),
            language: "".to_string(),
            num_threads: Some(2),
            provider: Some("cpu".to_string()),
            debug: false,
            ..Default::default()
        })
        .map_err(|err| format!("failed to initialize whisper recognizer: {err}"))?;

        Ok(Self { recognizer })
    }
}

impl AsrEngine for WhisperEngine {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> AsrOutput {
        let result = self.recognizer.transcribe(sample_rate, samples);
        AsrOutput {
            text: result.text,
            language: result.lang,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeEngine {
        text: String,
        language: String,
    }

    impl AsrEngine for FakeEngine {
        fn transcribe(&mut self, _sample_rate: u32, _samples: &[f32]) -> AsrOutput {
            AsrOutput {
                text: self.text.clone(),
                language: self.language.clone(),
            }
        }
    }

    #[test]
    fn asr_engine_is_object_safe_and_returns_output() {
        let mut engine: Box<dyn AsrEngine> = Box::new(FakeEngine {
            text: "hello world".to_string(),
            language: "en".to_string(),
        });

        let out = engine.transcribe(16_000, &[0.0; 16]);

        assert_eq!(out.text, "hello world");
        assert_eq!(out.language, "en");
    }
}
