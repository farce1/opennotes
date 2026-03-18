#[cfg(target_os = "macos")]
use std::fs::File;
#[cfg(target_os = "macos")]
use std::io::Write;
#[cfg(target_os = "macos")]
use std::path::Path;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tokio::time::sleep;

use super::detect;

#[cfg(target_os = "macos")]
const OLLAMA_ZIP_URL: &str = "https://ollama.com/download/Ollama-darwin.zip";
#[cfg(target_os = "macos")]
const PROGRESS_EMIT_STEP_BYTES: u64 = 512 * 1024;
const OLLAMA_START_TIMEOUT_SECS: u64 = 30;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum OllamaSetupEvent {
    Stage {
        name: String,
    },
    #[cfg(target_os = "macos")]
    DownloadProgress {
        downloaded_bytes: u64,
        total_bytes: u64,
    },
    PullProgress {
        status: String,
        completed: u64,
        total: u64,
    },
    Complete,
    Error {
        stage: String,
        message: String,
    },
}

fn send_stage(on_event: &Channel<OllamaSetupEvent>, name: &str) {
    let _ = on_event.send(OllamaSetupEvent::Stage {
        name: name.to_string(),
    });
}

fn send_error(on_event: &Channel<OllamaSetupEvent>, stage: &str, message: &str) {
    let _ = on_event.send(OllamaSetupEvent::Error {
        stage: stage.to_string(),
        message: message.to_string(),
    });
}

#[cfg(target_os = "macos")]
fn cleanup_tmp(path: &Path) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(target_os = "macos")]
fn cleanup_dir(path: &Path) {
    if path.exists() {
        let _ = std::fs::remove_dir_all(path);
    }
}

#[cfg(target_os = "macos")]
fn ollama_app_exists() -> bool {
    Path::new("/Applications/Ollama.app").exists()
}

#[cfg(target_os = "macos")]
async fn content_length(client: &Client, url: &str) -> u64 {
    match client.head(url).send().await {
        Ok(response) => response.content_length().unwrap_or(0),
        Err(_) => 0,
    }
}

#[cfg(target_os = "macos")]
async fn download_ollama_zip(
    client: &Client,
    tmp_path: &Path,
    on_event: &Channel<OllamaSetupEvent>,
) -> Result<(), String> {
    let head_total = content_length(client, OLLAMA_ZIP_URL).await;

    let response = client
        .get(OLLAMA_ZIP_URL)
        .send()
        .await
        .map_err(|err| format!("Failed to download Ollama: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status {}",
            response.status()
        ));
    }

    let total_bytes = if head_total > 0 {
        head_total
    } else {
        response.content_length().unwrap_or(0)
    };

    let mut stream = response.bytes_stream();
    let mut file = File::create(tmp_path)
        .map_err(|err| format!("Failed to create temp file: {err}"))?;

    let mut downloaded = 0u64;
    let mut last_emitted = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("Download interrupted: {err}"))?;
        file.write_all(&chunk)
            .map_err(|err| format!("Failed to write to disk: {err}"))?;

        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded.saturating_sub(last_emitted) >= PROGRESS_EMIT_STEP_BYTES {
            let _ = on_event.send(OllamaSetupEvent::DownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes,
            });
            last_emitted = downloaded;
        }
    }

    file.flush()
        .map_err(|err| format!("Failed to flush download: {err}"))?;

    let _ = on_event.send(OllamaSetupEvent::DownloadProgress {
        downloaded_bytes: downloaded,
        total_bytes,
    });

    Ok(())
}

#[cfg(target_os = "macos")]
fn extract_ollama_zip(zip_path: &Path) -> Result<std::path::PathBuf, String> {
    let tmp_dir = zip_path
        .parent()
        .unwrap_or(Path::new("/tmp"))
        .join("ollama_extract");
    cleanup_dir(&tmp_dir);
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|err| format!("Failed to create extraction dir: {err}"))?;

    let status = std::process::Command::new("/usr/bin/unzip")
        .arg("-o")
        .arg(zip_path)
        .arg("-d")
        .arg(&tmp_dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|err| format!("Failed to run unzip: {err}"))?;

    if !status.success() {
        cleanup_dir(&tmp_dir);
        return Err("Failed to extract Ollama zip".to_string());
    }

    let extracted_app = tmp_dir.join("Ollama.app");
    if !extracted_app.exists() {
        cleanup_dir(&tmp_dir);
        return Err("Extracted zip does not contain Ollama.app".to_string());
    }

    Ok(tmp_dir)
}

#[cfg(target_os = "macos")]
fn install_ollama_app(extract_dir: &Path) -> Result<(), String> {
    let extracted_app = extract_dir.join("Ollama.app");

    let dest = Path::new("/Applications/Ollama.app");
    if dest.exists() {
        let _ = std::fs::remove_dir_all(dest);
    }

    let cp_status = std::process::Command::new("cp")
        .arg("-R")
        .arg(&extracted_app)
        .arg("/Applications/")
        .status()
        .map_err(|err| format!("Failed to copy Ollama to Applications: {err}"))?;

    cleanup_dir(extract_dir);

    if !cp_status.success() {
        return Err("Failed to install Ollama to /Applications".to_string());
    }

    Ok(())
}

async fn start_and_wait_for_ollama(server_url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app_path = Path::new("/Applications/Ollama.app");
        if app_path.exists() {
            let status = std::process::Command::new("open")
                .arg(app_path)
                .status()
                .map_err(|err| format!("Failed to open Ollama.app: {err}"))?;

            if !status.success() {
                return Err("Failed to launch Ollama.app".to_string());
            }
        } else {
            std::process::Command::new("ollama")
                .arg("serve")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|err| format!("Failed to start ollama serve: {err}"))?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        std::process::Command::new("ollama")
            .arg("serve")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|err| format!("Failed to start ollama serve: {err}"))?;
    }

    for _ in 0..OLLAMA_START_TIMEOUT_SECS {
        sleep(Duration::from_secs(1)).await;
        if detect::check_ollama_running(server_url).await {
            return Ok(());
        }
    }

    Err("Ollama did not start within 30 seconds".to_string())
}

async fn pull_model_with_events(
    server_url: &str,
    model: &str,
    on_event: &Channel<OllamaSetupEvent>,
) -> Result<(), String> {
    let client = Client::new();
    let response = client
        .post(format!("{server_url}/api/pull"))
        .json(&serde_json::json!({
            "name": model,
            "stream": true
        }))
        .send()
        .await
        .map_err(|err| format!("Failed to connect to Ollama pull endpoint: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Ollama pull failed with status {}",
            response.status()
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("Model pull stream interrupted: {err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_index) = buffer.find('\n') {
            let line = buffer[..newline_index].trim().to_string();
            buffer.drain(..=newline_index);
            if line.is_empty() {
                continue;
            }

            let payload: Value = serde_json::from_str(&line)
                .map_err(|err| format!("Invalid pull event: {err}"))?;

            let status = payload
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("downloading")
                .to_string();
            let completed = payload
                .get("completed")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            let total = payload
                .get("total")
                .and_then(Value::as_u64)
                .unwrap_or_default();

            let _ = on_event.send(OllamaSetupEvent::PullProgress {
                status,
                completed,
                total,
            });
        }
    }

    if !buffer.trim().is_empty() {
        if let Ok(payload) = serde_json::from_str::<Value>(buffer.trim()) {
            let status = payload
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("downloading")
                .to_string();
            let completed = payload
                .get("completed")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            let total = payload
                .get("total")
                .and_then(Value::as_u64)
                .unwrap_or_default();

            let _ = on_event.send(OllamaSetupEvent::PullProgress {
                status,
                completed,
                total,
            });
        }
    }

    Ok(())
}

pub async fn auto_setup_ollama(
    server_url: &str,
    model: &str,
    on_event: &Channel<OllamaSetupEvent>,
) -> Result<(), String> {
    let status = detect::full_status(server_url, model).await;

    // Step 1: Install if needed (macOS only)
    #[cfg(target_os = "macos")]
    if !status.installed && !ollama_app_exists() {
        send_stage(on_event, "downloading_ollama");

        let tmp_dir = std::env::temp_dir().join("opennotes_ollama_setup");
        std::fs::create_dir_all(&tmp_dir)
            .map_err(|err| format!("Failed to create temp dir: {err}"))?;
        let zip_path = tmp_dir.join("Ollama-darwin.zip");
        cleanup_tmp(&zip_path);

        let client = Client::new();
        if let Err(err) = download_ollama_zip(&client, &zip_path, on_event).await {
            cleanup_tmp(&zip_path);
            send_error(on_event, "downloading_ollama", &err);
            return Err(err);
        }

        send_stage(on_event, "extracting_ollama");
        let extract_dir = match extract_ollama_zip(&zip_path) {
            Ok(dir) => dir,
            Err(err) => {
                cleanup_tmp(&zip_path);
                send_error(on_event, "extracting_ollama", &err);
                return Err(err);
            }
        };

        send_stage(on_event, "installing_ollama");
        if let Err(err) = install_ollama_app(&extract_dir) {
            cleanup_tmp(&zip_path);
            send_error(on_event, "installing_ollama", &err);
            return Err(err);
        }

        cleanup_tmp(&zip_path);
    }

    #[cfg(not(target_os = "macos"))]
    if !status.installed {
        let msg = "Please install Ollama manually from https://ollama.com/download".to_string();
        send_error(on_event, "installing_ollama", &msg);
        return Err(msg);
    }

    // Step 2: Start if not running
    if !detect::check_ollama_running(server_url).await {
        send_stage(on_event, "starting_ollama");
        if let Err(err) = start_and_wait_for_ollama(server_url).await {
            send_error(on_event, "starting_ollama", &err);
            return Err(err);
        }
    }

    // Step 3: Pull model if needed
    if !detect::check_model_pulled(server_url, model).await {
        send_stage(on_event, "pulling_model");
        if let Err(err) = pull_model_with_events(server_url, model, on_event).await {
            send_error(on_event, "pulling_model", &err);
            return Err(err);
        }
    }

    let _ = on_event.send(OllamaSetupEvent::Complete);
    Ok(())
}
