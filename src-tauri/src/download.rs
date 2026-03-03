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

pub async fn download_model(on_event: Channel<DownloadEvent>, models_dir: PathBuf) -> Result<(), String> {
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

    let vad_total = content_length(&client, VAD_URL).await;
    let parakeet_total = content_length(&client, PARAKEET_URL).await;
    let total_bytes = vad_total.saturating_add(parakeet_total);

    let vad_tmp = models_dir.join("silero_vad.onnx.tmp");
    let vad_final = model::vad_model_path(data_dir);
    cleanup_tmp(&vad_tmp);

    let vad_downloaded = match download_to_file(&client, VAD_URL, &vad_tmp, total_bytes, 0, &on_event).await {
        Ok(bytes) => bytes,
        Err(err) => {
            cleanup_tmp(&vad_tmp);
            send_error(&on_event, "Unable to download voice activity detector model. Please retry.");
            return Err(err);
        }
    };

    if let Err(err) = std::fs::rename(&vad_tmp, &vad_final) {
        cleanup_tmp(&vad_tmp);
        send_error(&on_event, "Unable to finalize downloaded VAD model file.");
        return Err(format!("failed to move VAD model into place: {err}"));
    }

    let parakeet_tmp = models_dir.join("parakeet-model.tar.bz2.tmp");
    cleanup_tmp(&parakeet_tmp);

    if let Err(err) = download_to_file(
        &client,
        PARAKEET_URL,
        &parakeet_tmp,
        total_bytes,
        vad_downloaded,
        &on_event,
    )
    .await
    {
        cleanup_tmp(&parakeet_tmp);
        send_error(
            &on_event,
            "Unable to download transcription model archive. Please retry.",
        );
        return Err(err);
    }

    let _ = on_event.send(DownloadEvent::Extracting);

    let tar_status = std::process::Command::new("tar")
        .arg("-xjf")
        .arg(&parakeet_tmp)
        .arg("-C")
        .arg(&models_dir)
        .status()
        .map_err(|err| format!("failed to run tar extraction: {err}"))?;

    if !tar_status.success() {
        cleanup_tmp(&parakeet_tmp);
        send_error(
            &on_event,
            "Failed to extract transcription model archive. Please retry.",
        );
        return Err("tar extraction failed for transcription model archive".to_string());
    }

    cleanup_tmp(&parakeet_tmp);

    let extracted_dir: PathBuf = model::parakeet_model_dir(data_dir);
    if !extracted_dir.exists() {
        send_error(
            &on_event,
            "Model extraction did not produce expected files. Please retry.",
        );
        return Err(format!(
            "extracted model directory not found: {}",
            extracted_dir.display()
        ));
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
