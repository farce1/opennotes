use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};

const OLLAMA_BASE_URL: &str = "http://localhost:11434";

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

pub async fn check_ollama_running() -> bool {
    let client = match Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    match client.get(OLLAMA_BASE_URL).send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

pub async fn check_ollama_installed() -> bool {
    if check_ollama_running().await {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        std::path::Path::new("/usr/local/bin/ollama").exists()
            || std::path::Path::new("/opt/homebrew/bin/ollama").exists()
    }

    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub async fn check_model_pulled(model: &str) -> bool {
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
        .get(format!("{OLLAMA_BASE_URL}/api/tags"))
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

pub async fn full_status(model_name: &str) -> OllamaStatus {
    let running = check_ollama_running().await;
    let installed = check_ollama_installed().await;
    let model_ready = if running {
        check_model_pulled(model_name).await
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
