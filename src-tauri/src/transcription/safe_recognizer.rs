//! Exception-safe wrapper around sherpa-onnx offline recognizer.
//!
//! The upstream C API lacks try/catch, so C++ exceptions from ONNX Runtime
//! abort the Rust process.  We link a C++ shim that catches them and returns
//! null instead — both for model creation and for transcription.

use std::mem;

use sherpa_rs::transducer::TransducerConfig;

extern "C" {
    fn SafeSherpaOnnxCreateOfflineRecognizer(
        config: *const sherpa_rs_sys::SherpaOnnxOfflineRecognizerConfig,
    ) -> *const sherpa_rs_sys::SherpaOnnxOfflineRecognizer;

    /// Perform full offline transcription (create stream, accept waveform,
    /// decode, read result) inside a try/catch.  Returns a malloc'd C string
    /// or null.  Caller must free with `SafeSherpaOnnxFreeString`.
    fn SafeSherpaOnnxTranscribeOffline(
        recognizer: *const sherpa_rs_sys::SherpaOnnxOfflineRecognizer,
        sample_rate: i32,
        samples: *const f32,
        num_samples: i32,
    ) -> *mut std::ffi::c_char;

    fn SafeSherpaOnnxFreeString(s: *mut std::ffi::c_char);
}

fn get_provider() -> String {
    #[cfg(target_os = "macos")]
    {
        "cpu".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "cpu".to_string()
    }
}

/// A transducer recognizer whose construction and transcription cannot crash
/// the process.
pub struct SafeTransducerRecognizer {
    recognizer: *const sherpa_rs_sys::SherpaOnnxOfflineRecognizer,
}

unsafe impl Send for SafeTransducerRecognizer {}
unsafe impl Sync for SafeTransducerRecognizer {}

impl SafeTransducerRecognizer {
    pub fn new(config: TransducerConfig) -> Result<Self, String> {
        let recognizer = unsafe {
            let debug: i32 = config.debug.into();
            let provider = config.provider.unwrap_or_else(get_provider);

            let provider_c = c(provider);
            let encoder_c = c(config.encoder);
            let decoder_c = c(config.decoder);
            let joiner_c = c(config.joiner);
            let tokens_c = c(config.tokens);
            let model_type_c = c(config.model_type);
            let modeling_unit_c = c(config.modeling_unit);
            let bpe_vocab_c = c(config.bpe_vocab);
            let hotwords_file_c = c(config.hotwords_file);
            let decoding_method_c = c(config.decoding_method);

            let offline_model_config = sherpa_rs_sys::SherpaOnnxOfflineModelConfig {
                transducer: sherpa_rs_sys::SherpaOnnxOfflineTransducerModelConfig {
                    encoder: encoder_c.as_ptr(),
                    decoder: decoder_c.as_ptr(),
                    joiner: joiner_c.as_ptr(),
                },
                tokens: tokens_c.as_ptr(),
                num_threads: config.num_threads,
                debug,
                provider: provider_c.as_ptr(),
                model_type: model_type_c.as_ptr(),
                modeling_unit: modeling_unit_c.as_ptr(),
                bpe_vocab: bpe_vocab_c.as_ptr(),
                telespeech_ctc: mem::zeroed(),
                paraformer: mem::zeroed(),
                tdnn: mem::zeroed(),
                nemo_ctc: mem::zeroed(),
                whisper: mem::zeroed(),
                sense_voice: mem::zeroed(),
                moonshine: mem::zeroed(),
                fire_red_asr: mem::zeroed(),
                dolphin: mem::zeroed(),
                zipformer_ctc: mem::zeroed(),
                canary: mem::zeroed(),
            };

            let recognizer_config = sherpa_rs_sys::SherpaOnnxOfflineRecognizerConfig {
                model_config: offline_model_config,
                feat_config: sherpa_rs_sys::SherpaOnnxFeatureConfig {
                    sample_rate: config.sample_rate,
                    feature_dim: config.feature_dim,
                },
                hotwords_file: hotwords_file_c.as_ptr(),
                blank_penalty: config.blank_penalty,
                decoding_method: decoding_method_c.as_ptr(),
                hotwords_score: config.hotwords_score,
                lm_config: mem::zeroed(),
                rule_fsts: mem::zeroed(),
                rule_fars: mem::zeroed(),
                max_active_paths: mem::zeroed(),
                hr: mem::zeroed(),
            };

            SafeSherpaOnnxCreateOfflineRecognizer(&recognizer_config)
        };

        if recognizer.is_null() {
            return Err("model loading failed (see stderr for details)".into());
        }

        Ok(Self { recognizer })
    }

    pub fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> String {
        unsafe {
            let ptr = SafeSherpaOnnxTranscribeOffline(
                self.recognizer,
                sample_rate as i32,
                samples.as_ptr(),
                samples.len() as i32,
            );
            if ptr.is_null() {
                return String::new();
            }
            let text = std::ffi::CStr::from_ptr(ptr)
                .to_string_lossy()
                .into_owned();
            SafeSherpaOnnxFreeString(ptr);
            text
        }
    }
}

impl Drop for SafeTransducerRecognizer {
    fn drop(&mut self) {
        unsafe {
            sherpa_rs_sys::SherpaOnnxDestroyOfflineRecognizer(self.recognizer);
        }
    }
}

fn c(s: impl Into<String>) -> std::ffi::CString {
    std::ffi::CString::new(s.into()).expect("CString::new failed")
}
