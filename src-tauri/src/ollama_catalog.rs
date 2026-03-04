use std::collections::HashSet;
use std::time::Duration;

use crate::commands::OllamaModelInfo;

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
            });
            continue;
        }

        for size in sizes {
            parsed.push(OllamaModelInfo {
                name: format!("{base_name}:{size}"),
                parameter_size: Some(size),
            });
        }
    }

    parsed
}

fn has_next_ollama_search_page(html: &str, next_page: usize) -> bool {
    html.contains(&format!("hx-get=\"/search?page={next_page}\""))
}

#[tauri::command]
pub async fn list_ollama_library_catalog_models() -> Result<Vec<OllamaModelInfo>, String> {
    const MAX_SEARCH_PAGES: usize = 20;

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

    Ok(catalog)
}
