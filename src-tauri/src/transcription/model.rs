use std::path::{Path, PathBuf};

pub const DEFAULT_LANGUAGE: &str = "en";
pub const POLISH_LANGUAGE: &str = "pl";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AsrBackend {
    ParakeetTransducer,
    Whisper,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptionModelKind {
    ParakeetTdt,
    WhisperTiny,
}

#[derive(Debug, Clone)]
pub struct ResolvedModel {
    pub kind: TranscriptionModelKind,
    pub backend: AsrBackend,
    pub model_dir: PathBuf,
    pub encoder_path: PathBuf,
    pub decoder_path: PathBuf,
    pub joiner_path: Option<PathBuf>,
    pub tokens_path: PathBuf,
}

pub fn models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models")
}

pub fn parakeet_model_dir(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join("sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8")
}

pub fn whisper_model_dir(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join("sherpa-onnx-whisper-tiny")
}

pub fn vad_model_path(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join("silero_vad.onnx")
}

pub fn normalize_language(language: Option<&str>) -> String {
    match language
        .unwrap_or(DEFAULT_LANGUAGE)
        .trim()
        .to_lowercase()
        .as_str()
    {
        "pl" | "pl-pl" => POLISH_LANGUAGE.to_string(),
        "en" | "en-us" | "en-gb" => DEFAULT_LANGUAGE.to_string(),
        _ => DEFAULT_LANGUAGE.to_string(),
    }
}

pub fn resolve_model(data_dir: &Path, language: Option<&str>) -> ResolvedModel {
    let normalized_language = normalize_language(language);

    if normalized_language == POLISH_LANGUAGE {
        let whisper_dir = whisper_model_dir(data_dir);

        return ResolvedModel {
            kind: TranscriptionModelKind::WhisperTiny,
            backend: AsrBackend::Whisper,
            model_dir: whisper_dir.clone(),
            encoder_path: whisper_dir.join("tiny-encoder.int8.onnx"),
            decoder_path: whisper_dir.join("tiny-decoder.int8.onnx"),
            joiner_path: None,
            tokens_path: whisper_dir.join("tiny-tokens.txt"),
        };
    }

    let parakeet_dir = parakeet_model_dir(data_dir);
    ResolvedModel {
        kind: TranscriptionModelKind::ParakeetTdt,
        backend: AsrBackend::ParakeetTransducer,
        model_dir: parakeet_dir.clone(),
        encoder_path: parakeet_dir.join("encoder.int8.onnx"),
        decoder_path: parakeet_dir.join("decoder.int8.onnx"),
        joiner_path: Some(parakeet_dir.join("joiner.int8.onnx")),
        tokens_path: parakeet_dir.join("tokens.txt"),
    }
}

pub fn check_transcription_assets_ready(data_dir: &Path, language: Option<&str>) -> bool {
    let resolved = resolve_model(data_dir, language);
    let mut required_files = vec![
        resolved.encoder_path,
        resolved.decoder_path,
        resolved.tokens_path,
    ];

    if let Some(joiner_path) = resolved.joiner_path {
        required_files.push(joiner_path);
    }

    required_files.iter().all(|path| path.exists())
}

pub fn check_model_ready(data_dir: &Path, language: Option<&str>) -> bool {
    check_transcription_assets_ready(data_dir, language) && vad_model_path(data_dir).exists()
}
