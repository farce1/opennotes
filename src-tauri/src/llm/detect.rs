use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub model_ready: bool,
    pub model_name: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaModelTag>,
}

#[derive(Deserialize)]
struct OllamaModelTag {
    name: String,
}

pub async fn check_ollama_running(server_url: &str) -> bool {
    let client = match Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    match client.get(server_url).send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

pub async fn check_ollama_installed(server_url: &str) -> bool {
    if check_ollama_running(server_url).await {
        return true;
    }

    check_ollama_binary_exists()
}

fn check_ollama_binary_exists() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::path::Path::new("/usr/local/bin/ollama").exists()
            || std::path::Path::new("/opt/homebrew/bin/ollama").exists()
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let path = std::path::PathBuf::from(local_app_data)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe");
            if path.exists() {
                return true;
            }
        }

        std::process::Command::new("where")
            .arg("ollama")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    #[cfg(target_os = "linux")]
    {
        std::path::Path::new("/usr/local/bin/ollama").exists()
            || std::path::Path::new("/usr/bin/ollama").exists()
            || std::process::Command::new("which")
                .arg("ollama")
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

pub async fn check_model_pulled(server_url: &str, model: &str) -> bool {
    if model.trim().is_empty() {
        return false;
    }

    let client = match Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    let response = match client
        .get(format!("{server_url}/api/tags"))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return false,
    };

    if !response.status().is_success() {
        return false;
    }

    let payload = match response.json::<OllamaTagsResponse>().await {
        Ok(payload) => payload,
        Err(_) => return false,
    };

    let target = model.to_lowercase();
    payload.models.into_iter().any(|entry| {
        let name = entry.name.to_lowercase();
        name == target || name.starts_with(&target) || name.starts_with(&format!("{target}:"))
    })
}

pub async fn full_status(server_url: &str, model_name: &str) -> OllamaStatus {
    let running = check_ollama_running(server_url).await;
    let installed = check_ollama_installed(server_url).await;
    let model_ready = if running {
        check_model_pulled(server_url, model_name).await
    } else {
        false
    };

    OllamaStatus {
        installed,
        running,
        model_ready,
        model_name: model_name.to_string(),
    }
}
