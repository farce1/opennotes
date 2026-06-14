use std::path::{Path, PathBuf};

pub const WHISPER_TURBO_DIR_NAME: &str = "sherpa-onnx-whisper-turbo";
pub const PARAKEET_V3_DIR_NAME: &str = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";

pub fn models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models")
}

pub fn whisper_turbo_model_dir(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join(WHISPER_TURBO_DIR_NAME)
}

pub fn parakeet_model_dir(data_dir: &Path) -> PathBuf {
    models_dir(data_dir).join(PARAKEET_V3_DIR_NAME)
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

pub fn check_parakeet_assets_ready(data_dir: &Path) -> bool {
    let dir = parakeet_model_dir(data_dir);

    [
        dir.join("encoder.int8.onnx"),
        dir.join("decoder.int8.onnx"),
        dir.join("joiner.int8.onnx"),
        dir.join("tokens.txt"),
    ]
    .iter()
    .all(|path| path.exists())
}

pub fn check_model_ready(data_dir: &Path) -> bool {
    check_transcription_assets_ready(data_dir) && vad_model_path(data_dir).exists()
}

pub fn check_parakeet_model_ready(data_dir: &Path) -> bool {
    check_parakeet_assets_ready(data_dir) && vad_model_path(data_dir).exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parakeet_ready_only_when_all_four_files_present() {
        let tmp = std::env::temp_dir().join(format!("on-parakeet-ready-{}", std::process::id()));
        let dir = parakeet_model_dir(&tmp);
        std::fs::create_dir_all(&dir).unwrap();
        let files = [
            "encoder.int8.onnx",
            "decoder.int8.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
        ];

        assert!(!check_parakeet_assets_ready(&tmp));
        for (idx, name) in files.iter().enumerate() {
            std::fs::write(dir.join(name), b"x").unwrap();
            let all_present = idx == files.len() - 1;
            assert_eq!(check_parakeet_assets_ready(&tmp), all_present);
        }

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn parakeet_model_ready_requires_assets_and_vad() {
        let tmp =
            std::env::temp_dir().join(format!("on-parakeet-model-ready-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);

        let dir = parakeet_model_dir(&tmp);
        std::fs::create_dir_all(&dir).unwrap();
        for name in [
            "encoder.int8.onnx",
            "decoder.int8.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
        ] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }

        // Assets present but VAD missing -> not ready.
        assert!(!check_parakeet_model_ready(&tmp));

        std::fs::write(vad_model_path(&tmp), b"x").unwrap();
        assert!(check_parakeet_model_ready(&tmp));

        std::fs::remove_dir_all(&tmp).ok();
    }
}
