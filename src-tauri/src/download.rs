use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use tauri::ipc::Channel;

use crate::transcription::model;

const VAD_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
const PARAKEET_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2";
const WHISPER_TINY_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2";
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
    Error {
        message: String,
    },
}

fn send_progress(on_event: &Channel<DownloadEvent>, downloaded_bytes: u64, total_bytes: u64) {
    let _ = on_event.send(DownloadEvent::Progress {
        downloaded_bytes,
        total_bytes,
    });
}

fn send_error(on_event: &Channel<DownloadEvent>, message: &str) {
    let _ = on_event.send(DownloadEvent::Error {
        message: message.to_string(),
    });
}

fn cleanup_tmp(path: &Path) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

async fn content_length(client: &Client, url: &str) -> u64 {
    match client.head(url).send().await {
        Ok(response) => response.content_length().unwrap_or(0),
        Err(_) => 0,
    }
}

async fn download_to_file(
    client: &Client,
    url: &str,
    destination_tmp: &Path,
    total_bytes: u64,
    base_downloaded: u64,
    on_event: &Channel<DownloadEvent>,
) -> Result<u64, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Unable to connect to model download server".to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Download request failed with status {}",
            response.status()
        ));
    }

    let mut stream = response.bytes_stream();
    let mut file = File::create(destination_tmp)
        .map_err(|_| format!("Failed to create temporary download file: {}", destination_tmp.display()))?;

    let mut downloaded = 0u64;
    let mut last_emitted = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Download stream was interrupted".to_string())?;
        file.write_all(&chunk)
            .map_err(|_| "Failed writing downloaded model bytes to disk".to_string())?;

        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded.saturating_sub(last_emitted) >= PROGRESS_EMIT_STEP_BYTES {
            send_progress(on_event, base_downloaded.saturating_add(downloaded), total_bytes);
            last_emitted = downloaded;
        }
    }

    file.flush()
        .map_err(|_| "Failed to flush downloaded model file to disk".to_string())?;

    send_progress(on_event, base_downloaded.saturating_add(downloaded), total_bytes);
    Ok(downloaded)
}

fn model_archive_url(kind: model::TranscriptionModelKind) -> &'static str {
    match kind {
        model::TranscriptionModelKind::ParakeetTdt => PARAKEET_URL,
        model::TranscriptionModelKind::WhisperTiny => WHISPER_TINY_URL,
    }
}

fn model_archive_tmp_name(kind: model::TranscriptionModelKind) -> &'static str {
    match kind {
        model::TranscriptionModelKind::ParakeetTdt => "parakeet-model.tar.bz2.tmp",
        model::TranscriptionModelKind::WhisperTiny => "whisper-model.tar.bz2.tmp",
    }
}

pub async fn download_model(
    on_event: Channel<DownloadEvent>,
    models_dir: PathBuf,
    transcription_language: Option<String>,
) -> Result<(), String> {
    std::fs::create_dir_all(&models_dir)
        .map_err(|_| format!("Failed to create models directory: {}", models_dir.display()))?;

    let data_dir = models_dir
        .parent()
        .ok_or_else(|| "invalid models directory path".to_string())?;
    let normalized_language = model::normalize_language(transcription_language.as_deref());
    let selected_model = model::resolve_model(data_dir, Some(normalized_language.as_str()));

    if model::check_model_ready(data_dir, Some(normalized_language.as_str())) {
        let _ = on_event.send(DownloadEvent::Complete);
        return Ok(());
    }

    let client = Client::new();
    let needs_vad = !model::vad_model_path(data_dir).exists();
    let needs_transcription_assets =
        !model::check_transcription_assets_ready(data_dir, Some(normalized_language.as_str()));
    let selected_archive_url = model_archive_url(selected_model.kind);

    let vad_total = if needs_vad {
        content_length(&client, VAD_URL).await
    } else {
        0
    };
    let model_total = if needs_transcription_assets {
        content_length(&client, selected_archive_url).await
    } else {
        0
    };
    let total_bytes = vad_total.saturating_add(model_total);
    let mut downloaded_so_far = 0u64;

    if needs_vad {
        let vad_tmp = models_dir.join("silero_vad.onnx.tmp");
        let vad_final = model::vad_model_path(data_dir);
        cleanup_tmp(&vad_tmp);

        let vad_downloaded =
            match download_to_file(&client, VAD_URL, &vad_tmp, total_bytes, 0, &on_event).await {
                Ok(bytes) => bytes,
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
        let model_archive_tmp = models_dir.join(model_archive_tmp_name(selected_model.kind));
        cleanup_tmp(&model_archive_tmp);

        if let Err(err) = download_to_file(
            &client,
            selected_archive_url,
            &model_archive_tmp,
            total_bytes,
            downloaded_so_far,
            &on_event,
        )
        .await
        {
            cleanup_tmp(&model_archive_tmp);
            send_error(
                &on_event,
                "Unable to download transcription model archive. Please retry.",
            );
            return Err(err);
        }

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

        if !selected_model.model_dir.exists() {
            send_error(
                &on_event,
                "Model extraction did not produce expected files. Please retry.",
            );
            return Err(format!(
                "extracted model directory not found: {}",
                selected_model.model_dir.display()
            ));
        }
    }

    if !model::check_model_ready(data_dir, Some(normalized_language.as_str())) {
        send_error(
            &on_event,
            "Model files are incomplete after download. Please retry.",
        );
        return Err("download finished but model readiness check failed".to_string());
    }

    let _ = on_event.send(DownloadEvent::Complete);
    Ok(())
}
