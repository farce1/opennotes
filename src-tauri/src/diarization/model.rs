use std::path::{Path, PathBuf};

pub const SEGMENTATION_ARCHIVE_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2";
pub const EMBEDDING_MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx";
pub const SEGMENTATION_DIR_NAME: &str = "sherpa-onnx-pyannote-segmentation-3-0";
pub const EMBEDDING_FILE_NAME: &str = "nemo_en_titanet_small.onnx";

pub fn diarization_models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models").join("diarization")
}

pub fn segmentation_model_path(data_dir: &Path) -> PathBuf {
    diarization_models_dir(data_dir)
        .join(SEGMENTATION_DIR_NAME)
        .join("model.onnx")
}

pub fn embedding_model_path(data_dir: &Path) -> PathBuf {
    diarization_models_dir(data_dir).join(EMBEDDING_FILE_NAME)
}

pub fn check_diarization_model_ready(data_dir: &Path) -> bool {
    segmentation_model_path(data_dir).exists() && embedding_model_path(data_dir).exists()
}
