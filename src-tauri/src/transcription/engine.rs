use std::path::Path;

use sherpa_rs::transducer::{TransducerConfig, TransducerRecognizer};
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

/// ONNX Runtime execution provider to request for the given OS. macOS prebuilt
/// sherpa-onnx binaries bundle CoreML; other platforms fall back to CPU.
fn select_provider(os: &str) -> &'static str {
    match os {
        "macos" => "coreml",
        _ => "cpu",
    }
}

fn current_provider() -> &'static str {
    select_provider(std::env::consts::OS)
}

/// Build with `provider`, retrying once on CPU if a non-CPU provider fails to load.
fn with_cpu_fallback<T>(
    provider: &str,
    mut build: impl FnMut(&str) -> Result<T, String>,
) -> Result<T, String> {
    match build(provider) {
        Err(_) if provider != "cpu" => build("cpu"),
        other => other,
    }
}

/// Whisper large-v3-turbo (int8) via sherpa-onnx.
pub struct WhisperEngine {
    recognizer: WhisperRecognizer,
}

impl WhisperEngine {
    pub fn load(model_dir: &Path) -> Result<Self, String> {
        with_cpu_fallback(current_provider(), |provider| {
            Self::load_with_provider(model_dir, provider)
        })
    }

    fn load_with_provider(model_dir: &Path, provider: &str) -> Result<Self, String> {
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
            provider: Some(provider.to_string()),
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

/// NVIDIA Parakeet-TDT-v3 (int8) via sherpa-onnx's offline transducer recognizer.
pub struct ParakeetEngine {
    recognizer: TransducerRecognizer,
}

impl ParakeetEngine {
    pub fn load(model_dir: &Path) -> Result<Self, String> {
        with_cpu_fallback(current_provider(), |provider| {
            Self::load_with_provider(model_dir, provider)
        })
    }

    fn load_with_provider(model_dir: &Path, provider: &str) -> Result<Self, String> {
        let recognizer = TransducerRecognizer::new(TransducerConfig {
            encoder: model_dir
                .join("encoder.int8.onnx")
                .to_string_lossy()
                .to_string(),
            decoder: model_dir
                .join("decoder.int8.onnx")
                .to_string_lossy()
                .to_string(),
            joiner: model_dir
                .join("joiner.int8.onnx")
                .to_string_lossy()
                .to_string(),
            tokens: model_dir
                .join("tokens.txt")
                .to_string_lossy()
                .to_string(),
            model_type: "nemo_transducer".to_string(),
            num_threads: 2,
            sample_rate: 16_000,
            feature_dim: 80,
            decoding_method: "greedy_search".to_string(),
            provider: Some(provider.to_string()),
            ..Default::default()
        })
        .map_err(|err| format!("failed to initialize parakeet recognizer: {err}"))?;

        Ok(Self { recognizer })
    }
}

impl AsrEngine for ParakeetEngine {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> AsrOutput {
        // The transducer recognizer returns text only; Parakeet reports no language.
        AsrOutput {
            text: self.recognizer.transcribe(sample_rate, samples),
            language: String::new(),
        }
    }
}

/// Build the configured ASR engine. `engine` mirrors `meetings.asr_engine`
/// ("whisper" | "parakeet"); `model_dir` must be that engine's model directory.
pub fn load_engine(engine: &str, model_dir: &Path) -> Result<Box<dyn AsrEngine>, String> {
    match engine {
        "parakeet" => Ok(Box::new(ParakeetEngine::load(model_dir)?)),
        _ => Ok(Box::new(WhisperEngine::load(model_dir)?)),
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

    #[test]
    fn select_provider_uses_coreml_on_macos_else_cpu() {
        assert_eq!(select_provider("macos"), "coreml");
        assert_eq!(select_provider("linux"), "cpu");
        assert_eq!(select_provider("windows"), "cpu");
    }

    #[test]
    fn with_cpu_fallback_retries_cpu_when_preferred_provider_fails() {
        let attempts = std::cell::RefCell::new(Vec::new());
        let result = with_cpu_fallback("coreml", |provider| {
            attempts.borrow_mut().push(provider.to_string());
            if provider == "cpu" {
                Ok(42)
            } else {
                Err("no gpu".to_string())
            }
        });

        assert_eq!(result, Ok(42));
        assert_eq!(*attempts.borrow(), vec!["coreml", "cpu"]);
    }

    #[test]
    fn with_cpu_fallback_does_not_retry_when_already_cpu() {
        let attempts = std::cell::RefCell::new(0);
        let result: Result<i32, String> = with_cpu_fallback("cpu", |_| {
            *attempts.borrow_mut() += 1;
            Err("boom".to_string())
        });

        assert!(result.is_err());
        assert_eq!(*attempts.borrow(), 1);
    }
}
