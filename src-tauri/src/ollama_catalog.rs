use std::collections::{HashMap, HashSet};
use std::time::Duration;

use crate::commands::OllamaModelInfo;
use futures_util::stream::{self, StreamExt};

fn parse_ollama_search_models(html: &str) -> Vec<OllamaModelInfo> {
    let mut parsed = Vec::new();

    for block in html.split("<li x-test-model").skip(1) {
        let Some(href_start) = block.find("href=\"/library/") else {
            continue;
        };
        let after_href = &block[href_start + "href=\"/library/".len()..];
        let Some(href_end) = after_href.find('"') else {
            continue;
        };

        let base_name = after_href[..href_end].trim();
        if base_name.is_empty() || base_name.contains('/') || base_name.contains(':') {
            continue;
        }

        let mut sizes = Vec::new();
        let mut remaining = block;
        while let Some(size_start) = remaining.find("x-test-size") {
            let after_size = &remaining[size_start..];
            let Some(content_start) = after_size.find('>') else {
                break;
            };
            let content = &after_size[content_start + 1..];
            let Some(content_end) = content.find("</span>") else {
                break;
            };

            let size = content[..content_end].trim().to_ascii_lowercase();
            if !size.is_empty() {
                sizes.push(size);
            }

            remaining = &content[content_end + "</span>".len()..];
        }

        if sizes.is_empty() {
            parsed.push(OllamaModelInfo {
                name: base_name.to_string(),
                parameter_size: None,
                download_size: None,
            });
            continue;
        }

        for size in sizes {
            parsed.push(OllamaModelInfo {
                name: format!("{base_name}:{size}"),
                parameter_size: Some(size),
                download_size: None,
            });
        }
    }

    parsed
}

fn extract_storage_size(text: &str) -> Option<String> {
    for (idx, _) in text.char_indices() {
        let unit = if text[idx..].starts_with("GB") {
            "GB"
        } else if text[idx..].starts_with("MB") {
            "MB"
        } else if text[idx..].starts_with("TB") {
            "TB"
        } else {
            continue;
        };

        let prefix = &text[..idx];
        let mut start = prefix.len();
        while start > 0 {
            let ch = prefix.as_bytes()[start - 1] as char;
            if ch.is_ascii_digit() || ch == '.' || ch == ' ' {
                start -= 1;
                continue;
            }
            break;
        }

        let number = prefix[start..].trim();
        if number.is_empty() || !number.chars().all(|ch| ch.is_ascii_digit() || ch == '.') {
            continue;
        }

        return Some(format!("{number}{unit}"));
    }

    None
}

fn parse_download_sizes_from_model_page(html: &str, base_name: &str) -> HashMap<String, String> {
    let mut parsed = HashMap::new();

    for block in html.split("href=\"/library/").skip(1) {
        let Some(name_end) = block.find('"') else {
            continue;
        };

        let model_name = block[..name_end].trim();
        if model_name.is_empty() || model_name == base_name || !model_name.starts_with(base_name) {
            continue;
        }

        let suffix = &model_name[base_name.len()..];
        if !suffix.starts_with(':') {
            continue;
        }

        let lookahead_start = name_end;
        let lookahead_end = (lookahead_start + 1800).min(block.len());
        let lookahead = &block[lookahead_start..lookahead_end];

        if let Some(download_size) = extract_storage_size(lookahead) {
            parsed
                .entry(model_name.to_string())
                .or_insert(download_size);
        }
    }

    parsed
}

async fn fetch_download_sizes_for_base(
    client: &reqwest::Client,
    base_name: String,
) -> HashMap<String, String> {
    let response = match client
        .get(format!("https://ollama.com/library/{base_name}"))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return HashMap::new(),
    };

    if !response.status().is_success() {
        return HashMap::new();
    }

    let html = match response.text().await {
        Ok(html) => html,
        Err(_) => return HashMap::new(),
    };

    parse_download_sizes_from_model_page(&html, &base_name)
}

fn has_next_ollama_search_page(html: &str, next_page: usize) -> bool {
    html.contains(&format!("hx-get=\"/search?page={next_page}\""))
}

#[tauri::command]
pub async fn list_ollama_library_catalog_models() -> Result<Vec<OllamaModelInfo>, String> {
    const MAX_SEARCH_PAGES: usize = 20;
    const DETAIL_FETCH_CONCURRENCY: usize = 8;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|err| err.to_string())?;

    let mut page = 1usize;
    let mut catalog = Vec::new();
    let mut seen = HashSet::new();

    loop {
        let response = client
            .get(format!("https://ollama.com/search?page={page}&o=popular"))
            .send()
            .await
            .map_err(|err| format!("failed to fetch Ollama model catalog page {page}: {err}"))?;

        if !response.status().is_success() {
            return Err(format!(
                "failed to fetch Ollama model catalog page {page}: HTTP {}",
                response.status()
            ));
        }

        let html = response
            .text()
            .await
            .map_err(|err| format!("failed to read Ollama model catalog page {page}: {err}"))?;

        for model in parse_ollama_search_models(&html) {
            if seen.insert(model.name.clone()) {
                catalog.push(model);
            }
        }

        let next_page = page + 1;
        if page >= MAX_SEARCH_PAGES || !has_next_ollama_search_page(&html, next_page) {
            break;
        }

        page = next_page;
    }

    if catalog.is_empty() {
        return Err("No downloadable Ollama models found in the remote catalog.".to_string());
    }

    let mut unique_bases = HashSet::new();
    let mut bases = Vec::new();
    for model in &catalog {
        let Some(base_name) = model.name.split(':').next() else {
            continue;
        };
        if base_name.is_empty() {
            continue;
        }
        if unique_bases.insert(base_name.to_string()) {
            bases.push(base_name.to_string());
        }
    }

    let size_maps = stream::iter(bases.into_iter().map(|base_name| {
        let client = client.clone();
        async move { fetch_download_sizes_for_base(&client, base_name).await }
    }))
    .buffer_unordered(DETAIL_FETCH_CONCURRENCY)
    .collect::<Vec<_>>()
    .await;

    let mut download_sizes = HashMap::new();
    for size_map in size_maps {
        for (model_name, download_size) in size_map {
            download_sizes
                .entry(model_name)
                .or_insert(download_size);
        }
    }

    for model in &mut catalog {
        model.download_size = download_sizes.get(&model.name).cloned();
        if model.download_size.is_some() || model.name.contains(':') {
            continue;
        }
        model.download_size = download_sizes
            .get(&format!("{}:latest", model.name))
            .cloned();
    }

    Ok(catalog)
}
