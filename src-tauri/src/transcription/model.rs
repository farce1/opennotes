use std::path::PathBuf;

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn models_dir() -> PathBuf {
    home_dir().join(".opennotes").join("models")
}

pub fn parakeet_model_dir() -> PathBuf {
    models_dir().join("sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8")
}

pub fn vad_model_path() -> PathBuf {
    models_dir().join("silero_vad.onnx")
}

pub fn check_model_ready() -> bool {
    let parakeet_dir = parakeet_model_dir();
    let required_files = [
        parakeet_dir.join("encoder.int8.onnx"),
        parakeet_dir.join("decoder.int8.onnx"),
        parakeet_dir.join("joiner.int8.onnx"),
        parakeet_dir.join("tokens.txt"),
        vad_model_path(),
    ];

    required_files.iter().all(|path| path.exists())
}
