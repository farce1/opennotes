use std::path::{Path, PathBuf};

pub fn models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models")
}

pub fn parakeet_model_dir(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join("sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8")
}

pub fn vad_model_path(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join("silero_vad.onnx")
}

pub fn check_model_ready(data_dir: &Path) -> bool {
    let parakeet_dir = parakeet_model_dir(data_dir);
    let required_files = [
        parakeet_dir.join("encoder.int8.onnx"),
        parakeet_dir.join("decoder.int8.onnx"),
        parakeet_dir.join("joiner.int8.onnx"),
        parakeet_dir.join("tokens.txt"),
        vad_model_path(data_dir),
    ];

    required_files.iter().all(|path| path.exists())
}
