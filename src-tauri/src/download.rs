use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use reqwest::{header, Client, StatusCode};
use serde::Serialize;
use tauri::ipc::Channel;

use crate::diarization::model as diarization_model;
use crate::transcription::model;

pub type DownloadCancelFlag = Arc<AtomicBool>;

const VAD_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
const WHISPER_TURBO_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2";
const WHISPER_TURBO_TMP_NAME: &str = "whisper-turbo-model.tar.bz2.tmp";
const DIARIZATION_SEGMENTATION_TMP_NAME: &str = "diarization-segmentation-model.tar.bz2.tmp";
const DIARIZATION_EMBEDDING_TMP_NAME: &str = "nemo_en_titanet_small.onnx.tmp";
const PROGRESS_EMIT_STEP_BYTES: u64 = 512 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum DownloadEvent {
    Progress {
        downloaded_bytes: u64,
        total_bytes: u64,
    },
    Extracting,
    Complete,
    Cancelled,
    Error {
        message: String,
    },
}

pub(crate) fn send_progress(on_event: &Channel<DownloadEvent>, downloaded_bytes: u64, total_bytes: u64) {
    let _ = on_event.send(DownloadEvent::Progress {
        downloaded_bytes,
        total_bytes,
    });
}

pub(crate) fn send_error(on_event: &Channel<DownloadEvent>, message: &str) {
    let _ = on_event.send(DownloadEvent::Error {
        message: message.to_string(),
    });
}

pub(crate) fn cleanup_tmp(path: &Path) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub(crate) async fn content_length(client: &Client, url: &str) -> u64 {
    match client.head(url).send().await {
        Ok(response) => response.content_length().unwrap_or(0),
        Err(_) => 0,
    }
}

pub(crate) async fn download_to_file(
    client: &Client,
    url: &str,
    destination_tmp: &Path,
    total_bytes: u64,
    base_downloaded: u64,
    on_event: &Channel<DownloadEvent>,
    cancel_flag: &DownloadCancelFlag,
    resumable: bool,
) -> Result<u64, String> {
    let mut existing_bytes = 0u64;
    if resumable {
        if let Ok(metadata) = std::fs::metadata(destination_tmp) {
            existing_bytes = metadata.len();
        }
    }

    let mut request = client.get(url);
    if existing_bytes > 0 {
        request = request.header(header::RANGE, format!("bytes={existing_bytes}-"));
    }

    let response = request
        .send()
        .await
        .map_err(|_| "Unable to connect to model download server".to_string())?;

    if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
        return Err("range_not_satisfiable".to_string());
    }

    if !response.status().is_success() {
        return Err(format!(
            "Download request failed with status {}",
            response.status()
        ));
    }

    let append_mode = existing_bytes > 0 && response.status() == StatusCode::PARTIAL_CONTENT;

    if existing_bytes > 0 && !append_mode {
        cleanup_tmp(destination_tmp);
        existing_bytes = 0;
    }

    let mut file = if append_mode {
        OpenOptions::new()
            .append(true)
            .open(destination_tmp)
            .map_err(|_| {
                format!(
                    "Failed to open temporary download file for resume: {}",
                    destination_tmp.display()
                )
            })?
    } else {
        File::create(destination_tmp).map_err(|_| {
            format!(
                "Failed to create temporary download file: {}",
                destination_tmp.display()
            )
        })?
    };

    let effective_base_downloaded = base_downloaded.saturating_add(existing_bytes);
    let response_content_length = response.content_length().unwrap_or(0);
    let effective_total = if total_bytes > 0 {
        total_bytes
    } else {
        effective_base_downloaded.saturating_add(response_content_length)
    };

    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;
    let mut last_emitted = 0u64;

    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }

        let chunk = chunk.map_err(|_| "Download stream was interrupted".to_string())?;
        file.write_all(&chunk)
            .map_err(|_| "Failed writing downloaded model bytes to disk".to_string())?;

        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded.saturating_sub(last_emitted) >= PROGRESS_EMIT_STEP_BYTES {
            send_progress(
                on_event,
                effective_base_downloaded.saturating_add(downloaded),
                effective_total,
            );
            last_emitted = downloaded;
        }
    }

    file.flush()
        .map_err(|_| "Failed to flush downloaded model file to disk".to_string())?;

    send_progress(
        on_event,
        effective_base_downloaded.saturating_add(downloaded),
        effective_total,
    );

    Ok(existing_bytes.saturating_add(downloaded))
}

pub async fn download_model(
    on_event: Channel<DownloadEvent>,
    models_dir: PathBuf,
    cancel_flag: DownloadCancelFlag,
) -> Result<(), String> {
    cancel_flag.store(false, Ordering::SeqCst);
    std::fs::create_dir_all(&models_dir)
        .map_err(|_| format!("Failed to create models directory: {}", models_dir.display()))?;

    let data_dir = models_dir
        .parent()
        .ok_or_else(|| "invalid models directory path".to_string())?;

    if model::check_model_ready(data_dir) {
        let _ = on_event.send(DownloadEvent::Complete);
        return Ok(());
    }

    let client = Client::new();
    let needs_vad = !model::vad_model_path(data_dir).exists();
    let needs_transcription_assets = !model::check_transcription_assets_ready(data_dir);

    let vad_total = if needs_vad {
        content_length(&client, VAD_URL).await
    } else {
        0
    };
    let model_total = if needs_transcription_assets {
        content_length(&client, WHISPER_TURBO_URL).await
    } else {
        0
    };
    let total_bytes = vad_total.saturating_add(model_total);
    let mut downloaded_so_far = 0u64;

    if needs_vad {
        let vad_tmp = models_dir.join("silero_vad.onnx.tmp");
        let vad_final = model::vad_model_path(data_dir);
        cleanup_tmp(&vad_tmp);

        let vad_downloaded = match download_to_file(
            &client,
            VAD_URL,
            &vad_tmp,
            total_bytes,
            0,
            &on_event,
            &cancel_flag,
            false,
        )
        .await
        {
            Ok(bytes) => bytes,
            Err(err) if err == "cancelled" => {
                cleanup_tmp(&vad_tmp);
                let _ = on_event.send(DownloadEvent::Cancelled);
                return Err(err);
            }
            Err(err) => {
                cleanup_tmp(&vad_tmp);
                send_error(
                    &on_event,
                    "Unable to download voice activity detector model. Please retry.",
                );
                return Err(err);
            }
        };

        if let Err(err) = std::fs::rename(&vad_tmp, &vad_final) {
            cleanup_tmp(&vad_tmp);
            send_error(&on_event, "Unable to finalize downloaded VAD model file.");
            return Err(format!("failed to move VAD model into place: {err}"));
        }

        downloaded_so_far = downloaded_so_far.saturating_add(vad_downloaded);
    }

    if needs_transcription_assets {
        let model_archive_tmp = models_dir.join(WHISPER_TURBO_TMP_NAME);

        let download_attempt = download_to_file(
            &client,
            WHISPER_TURBO_URL,
            &model_archive_tmp,
            total_bytes,
            downloaded_so_far,
            &on_event,
            &cancel_flag,
            true,
        )
        .await;

        match download_attempt {
            Ok(bytes) => bytes,
            Err(err) if err == "range_not_satisfiable" => {
                cleanup_tmp(&model_archive_tmp);
                match download_to_file(
                    &client,
                    WHISPER_TURBO_URL,
                    &model_archive_tmp,
                    total_bytes,
                    downloaded_so_far,
                    &on_event,
                    &cancel_flag,
                    false,
                )
                .await
                {
                    Ok(bytes) => bytes,
                    Err(err) if err == "cancelled" => {
                        cleanup_tmp(&model_archive_tmp);
                        let _ = on_event.send(DownloadEvent::Cancelled);
                        return Err(err);
                    }
                    Err(err) => {
                        cleanup_tmp(&model_archive_tmp);
                        send_error(
                            &on_event,
                            "Unable to download transcription model archive. Please retry.",
                        );
                        return Err(err);
                    }
                }
            }
            Err(err) if err == "cancelled" => {
                cleanup_tmp(&model_archive_tmp);
                let _ = on_event.send(DownloadEvent::Cancelled);
                return Err(err);
            }
            Err(err) => {
                cleanup_tmp(&model_archive_tmp);
                send_error(
                    &on_event,
                    "Unable to download transcription model archive. Please retry.",
                );
                return Err(err);
            }
        };

        let _ = on_event.send(DownloadEvent::Extracting);

        let tar_status = std::process::Command::new("tar")
            .arg("-xjf")
            .arg(&model_archive_tmp)
            .arg("-C")
            .arg(&models_dir)
            .status()
            .map_err(|err| format!("failed to run tar extraction: {err}"))?;

        if !tar_status.success() {
            cleanup_tmp(&model_archive_tmp);
            send_error(
                &on_event,
                "Failed to extract transcription model archive. Please retry.",
            );
            return Err("tar extraction failed for transcription model archive".to_string());
        }

        cleanup_tmp(&model_archive_tmp);

        if !model::whisper_turbo_model_dir(data_dir).exists() {
            send_error(
                &on_event,
                "Model extraction did not produce expected files. Please retry.",
            );
            return Err(format!(
                "extracted model directory not found: {}",
                model::whisper_turbo_model_dir(data_dir).display()
            ));
        }
    }

    if !model::check_model_ready(data_dir) {
        send_error(
            &on_event,
            "Model files are incomplete after download. Please retry.",
        );
        return Err("download finished but model readiness check failed".to_string());
    }

    let _ = on_event.send(DownloadEvent::Complete);
    Ok(())
}

pub async fn download_diarization_model(
    on_event: Channel<DownloadEvent>,
    data_dir: PathBuf,
    cancel_flag: DownloadCancelFlag,
) -> Result<(), String> {
    cancel_flag.store(false, Ordering::SeqCst);

    let diarization_dir = diarization_model::diarization_models_dir(data_dir.as_path());
    std::fs::create_dir_all(&diarization_dir)
        .map_err(|_| format!("Failed to create diarization models directory: {}", diarization_dir.display()))?;

    if diarization_model::check_diarization_model_ready(data_dir.as_path()) {
        let _ = on_event.send(DownloadEvent::Complete);
        return Ok(());
    }

    let client = Client::new();
    let needs_segmentation = !diarization_model::segmentation_model_path(data_dir.as_path()).exists();
    let needs_embedding = !diarization_model::embedding_model_path(data_dir.as_path()).exists();

    let segmentation_total = if needs_segmentation {
        content_length(&client, diarization_model::SEGMENTATION_ARCHIVE_URL).await
    } else {
        0
    };
    let embedding_total = if needs_embedding {
        content_length(&client, diarization_model::EMBEDDING_MODEL_URL).await
    } else {
        0
    };
    let total_bytes = segmentation_total.saturating_add(embedding_total);
    let mut downloaded_so_far = 0u64;

    if needs_segmentation {
        let archive_tmp = diarization_dir.join(DIARIZATION_SEGMENTATION_TMP_NAME);

        let segmentation_downloaded = match download_to_file(
            &client,
            diarization_model::SEGMENTATION_ARCHIVE_URL,
            &archive_tmp,
            total_bytes,
            downloaded_so_far,
            &on_event,
            &cancel_flag,
            true,
        )
        .await
        {
            Ok(bytes) => bytes,
            Err(err) if err == "range_not_satisfiable" => {
                cleanup_tmp(&archive_tmp);
                match download_to_file(
                    &client,
                    diarization_model::SEGMENTATION_ARCHIVE_URL,
                    &archive_tmp,
                    total_bytes,
                    downloaded_so_far,
                    &on_event,
                    &cancel_flag,
                    false,
                )
                .await
                {
                    Ok(bytes) => bytes,
                    Err(err) if err == "cancelled" => {
                        cleanup_tmp(&archive_tmp);
                        let _ = on_event.send(DownloadEvent::Cancelled);
                        return Err(err);
                    }
                    Err(err) => {
                        cleanup_tmp(&archive_tmp);
                        send_error(
                            &on_event,
                            "Unable to download speaker segmentation model archive. Please retry.",
                        );
                        return Err(err);
                    }
                }
            }
            Err(err) if err == "cancelled" => {
                cleanup_tmp(&archive_tmp);
                let _ = on_event.send(DownloadEvent::Cancelled);
                return Err(err);
            }
            Err(err) => {
                cleanup_tmp(&archive_tmp);
                send_error(
                    &on_event,
                    "Unable to download speaker segmentation model archive. Please retry.",
                );
                return Err(err);
            }
        };

        downloaded_so_far = downloaded_so_far.saturating_add(segmentation_downloaded);
        let _ = on_event.send(DownloadEvent::Extracting);

        let tar_status = std::process::Command::new("tar")
            .arg("-xjf")
            .arg(&archive_tmp)
            .arg("-C")
            .arg(&diarization_dir)
            .status()
            .map_err(|err| format!("failed to run diarization tar extraction: {err}"))?;

        cleanup_tmp(&archive_tmp);

        if !tar_status.success() {
            send_error(
                &on_event,
                "Failed to extract speaker segmentation model archive. Please retry.",
            );
            return Err("tar extraction failed for diarization segmentation archive".to_string());
        }

        if !diarization_model::segmentation_model_path(data_dir.as_path()).exists() {
            send_error(
                &on_event,
                "Speaker segmentation extraction did not produce expected files. Please retry.",
            );
            return Err(format!(
                "missing expected diarization segmentation model file: {}",
                diarization_model::segmentation_model_path(data_dir.as_path()).display()
            ));
        }
    }

    if needs_embedding {
        let embedding_tmp = diarization_dir.join(DIARIZATION_EMBEDDING_TMP_NAME);
        let embedding_final = diarization_model::embedding_model_path(data_dir.as_path());
        cleanup_tmp(&embedding_tmp);

        let _embedding_downloaded = match download_to_file(
            &client,
            diarization_model::EMBEDDING_MODEL_URL,
            &embedding_tmp,
            total_bytes,
            downloaded_so_far,
            &on_event,
            &cancel_flag,
            true,
        )
        .await
        {
            Ok(bytes) => bytes,
            Err(err) if err == "range_not_satisfiable" => {
                cleanup_tmp(&embedding_tmp);
                match download_to_file(
                    &client,
                    diarization_model::EMBEDDING_MODEL_URL,
                    &embedding_tmp,
                    total_bytes,
                    downloaded_so_far,
                    &on_event,
                    &cancel_flag,
                    false,
                )
                .await
                {
                    Ok(bytes) => bytes,
                    Err(err) if err == "cancelled" => {
                        cleanup_tmp(&embedding_tmp);
                        let _ = on_event.send(DownloadEvent::Cancelled);
                        return Err(err);
                    }
                    Err(err) => {
                        cleanup_tmp(&embedding_tmp);
                        send_error(
                            &on_event,
                            "Unable to download speaker embedding model. Please retry.",
                        );
                        return Err(err);
                    }
                }
            }
            Err(err) if err == "cancelled" => {
                cleanup_tmp(&embedding_tmp);
                let _ = on_event.send(DownloadEvent::Cancelled);
                return Err(err);
            }
            Err(err) => {
                cleanup_tmp(&embedding_tmp);
                send_error(
                    &on_event,
                    "Unable to download speaker embedding model. Please retry.",
                );
                return Err(err);
            }
        };

        if let Some(parent) = embedding_final.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("failed to create embedding model directory: {err}"))?;
        }

        std::fs::rename(&embedding_tmp, &embedding_final).map_err(|err| {
            cleanup_tmp(&embedding_tmp);
            format!("failed to finalize speaker embedding model file: {err}")
        })?;
    }

    if !diarization_model::check_diarization_model_ready(data_dir.as_path()) {
        send_error(
            &on_event,
            "Speaker diarization model files are incomplete after download. Please retry.",
        );
        return Err("download finished but diarization model readiness check failed".to_string());
    }

    let _ = on_event.send(DownloadEvent::Complete);
    Ok(())
}
