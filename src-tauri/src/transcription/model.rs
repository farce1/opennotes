use std::path::{Path, PathBuf};

pub const WHISPER_TURBO_DIR_NAME: &str = "sherpa-onnx-whisper-turbo";

pub fn models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models")
}

pub fn whisper_turbo_model_dir(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join(WHISPER_TURBO_DIR_NAME)
}

pub fn vad_model_path(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join("silero_vad.onnx")
}

pub fn check_transcription_assets_ready(data_dir: &Path) -> bool {
    let whisper_dir = whisper_turbo_model_dir(data_dir);

    [
        whisper_dir.join("turbo-encoder.int8.onnx"),
        whisper_dir.join("turbo-decoder.int8.onnx"),
        whisper_dir.join("turbo-tokens.txt"),
    ]
    .iter()
    .all(|path| path.exists())
}

pub fn check_model_ready(data_dir: &Path) -> bool {
    check_transcription_assets_ready(data_dir) && vad_model_path(data_dir).exists()
}
