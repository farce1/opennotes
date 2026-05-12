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

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaDownloadMetadata {
    pub source_domain: String,
    pub download_url: String,
    pub size_bytes: Option<u64>,
}

/// Pure consent guard — returns Err with the canonical `consent_required` event
/// payload when the user has not consented. This is split out from
/// `auto_setup_ollama` so it can be unit-tested without constructing a real
/// `tauri::ipc::Channel` (which requires a running App context).
///
/// The Err variant carries an `OllamaSetupEvent::Error { stage, message }` so
/// the caller can `send_error(on_event, ...)` and then `Err(...)` with no
/// duplicated string literals.
///
/// `stage: "consent_required"` is part of the i18n contract — the frontend
/// `OllamaSetupContext.tsx` error handler matches on this exact string to
/// surface the "Click Set up AI again" copy. Do not rename without updating
/// the frontend handler.
pub(crate) fn check_consent(user_consented: bool) -> Result<(), OllamaSetupEvent> {
    if !user_consented {
        return Err(OllamaSetupEvent::Error {
            message: "User consent required before downloading Ollama installer".to_string(),
            stage: "consent_required".to_string(),
        });
    }
    Ok(())
}

/// Resolve the download metadata used in the ONBOARD-04 consent modal.
///
/// - On macOS: returns the full Ollama-darwin.zip URL and a HEAD-resolved size.
/// - On non-macOS: returns empty `download_url` and `size_bytes: None` (no auto-install path).
///
/// HEAD requests use a 5s timeout. A timeout / network failure resolves to
/// `size_bytes: None` — NEVER returns Err. Per CONTEXT.md D-22 / RESEARCH.md Pitfall 7:
/// "do NOT block on HEAD failure."
pub async fn resolve_download_metadata() -> OllamaDownloadMetadata {
    let source_domain = "ollama.com".to_string();

    #[cfg(target_os = "macos")]
    {
        let download_url = OLLAMA_ZIP_URL.to_string();
        let size_bytes = head_size_with_timeout(&download_url, std::time::Duration::from_secs(5)).await;
        OllamaDownloadMetadata { source_domain, download_url, size_bytes }
    }

    #[cfg(not(target_os = "macos"))]
    {
        OllamaDownloadMetadata {
            source_domain,
            download_url: String::new(),
            size_bytes: None,
        }
    }
}

#[cfg(target_os = "macos")]
async fn head_size_with_timeout(url: &str, timeout: std::time::Duration) -> Option<u64> {
    let client = match reqwest::Client::builder().timeout(timeout).build() {
        Ok(c) => c,
        Err(_) => return None,
    };
    match client.head(url).send().await {
        Ok(resp) => resp.content_length(),
        Err(_) => None,
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
    user_consented: bool,
) -> Result<(), String> {
    // Defense-in-depth consent gate (D-25). The frontend modal is the primary
    // gate; this helper rejects any future regression that skips the modal.
    if let Err(evt) = check_consent(user_consented) {
        let _ = on_event.send(evt);
        return Err("consent_required".to_string());
    }

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

#[cfg(test)]
mod consent_guard_tests {
    use super::{check_consent, OllamaSetupEvent};

    // user_consented=false must return Err with stage="consent_required".
    // This is the defense-in-depth gate the frontend depends on for the
    // "Click Set up AI again" error copy.
    #[test]
    fn check_consent_false_returns_err_with_stage_consent_required() {
        let result = check_consent(false);
        assert!(result.is_err(), "check_consent(false) must return Err");
        match result {
            Err(OllamaSetupEvent::Error { ref stage, .. }) => {
                assert_eq!(stage, "consent_required",
                    "stage discriminator must be 'consent_required' — frontend i18n contract");
            }
            Err(_other) => panic!("expected OllamaSetupEvent::Error variant"),
            Ok(()) => unreachable!(),
        }
    }

    // user_consented=true must return Ok(()) — the function MUST NOT block
    // legitimate consent flows.
    #[test]
    fn check_consent_true_returns_ok() {
        let result = check_consent(true);
        assert!(result.is_ok(), "check_consent(true) must return Ok");
    }

    // Combined assertion form per B5 acceptance criterion — both calls in one test
    // body so a single grep can confirm both behaviors are exercised.
    #[test]
    fn check_consent_combined_behavior() {
        assert!(check_consent(false).is_err());
        assert!(check_consent(true).is_ok());
    }
}
