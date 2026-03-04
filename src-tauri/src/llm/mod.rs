pub mod detect;
pub mod setup;

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::ipc::Channel;
use std::time::Duration;

pub const DEFAULT_MODEL: &str = "phi4-mini";
pub const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";
const MAX_SINGLE_PASS_CHARS: usize = 96_000;
const MAP_CHUNK_CHARS: usize = 80_000;
const MAP_CHUNK_OVERLAP_CHARS: usize = 2_000;
const CHARS_PER_TOKEN_ESTIMATE: f64 = 3.5;
const PROMPT_OVERHEAD_TOKENS: u64 = 500;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum LlmTokenEvent {
    Token { text: String, done: bool },
    Error { message: String },
    TitleExtracted { title: String },
    ContextTruncated { minutes_covered: u32 },
    OllamaError { kind: String, raw: String },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum OllamaPullEvent {
    Progress {
        status: String,
        completed: u64,
        total: u64,
    },
    Complete,
    Error { message: String },
}

#[derive(Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SummaryRow {
    pub id: i64,
    pub meeting_id: i64,
    pub content: String,
    pub format: String,
    pub llm_provider: Option<String>,
    pub llm_model: Option<String>,
    pub generated_at: String,
}

fn send_pull_error(on_event: &Channel<OllamaPullEvent>, message: &str) {
    let _ = on_event.send(OllamaPullEvent::Error {
        message: message.to_string(),
    });
}

fn send_token_error(on_event: &Channel<LlmTokenEvent>, message: &str) {
    let _ = on_event.send(LlmTokenEvent::Error {
        message: message.to_string(),
    });
}

pub fn normalize_model_name(model: &str) -> String {
    model.strip_suffix(":latest").unwrap_or(model).to_string()
}

pub async fn query_model_context_length(server_url: &str, model: &str) -> u64 {
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(client) => client,
        Err(_) => return 4096,
    };

    let response = match client
        .post(format!("{server_url}/api/show"))
        .json(&serde_json::json!({ "name": model }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return 4096,
    };

    if !response.status().is_success() {
        return 4096;
    }

    let payload = match response.json::<Value>().await {
        Ok(payload) => payload,
        Err(_) => return 4096,
    };

    let Some(model_info) = payload.get("model_info").and_then(Value::as_object) else {
        return 4096;
    };

    model_info
        .iter()
        .find_map(|(key, value)| {
            if !key.ends_with(".context_length") {
                return None;
            }

            value.as_u64().or_else(|| {
                value
                    .as_str()
                    .and_then(|raw| raw.parse::<u64>().ok())
            })
        })
        .unwrap_or(4096)
}

fn estimate_tokens(text: &str) -> u64 {
    (text.len() as f64 / CHARS_PER_TOKEN_ESTIMATE).ceil() as u64 + PROMPT_OVERHEAD_TOKENS
}

fn choose_num_ctx(model_context_length: u64, transcript: &str) -> u64 {
    estimate_tokens(transcript)
        .min(model_context_length)
        .max(512)
}

fn classify_ollama_error(err_str: &str) -> (String, String) {
    let lowered = err_str.to_lowercase();
    let kind = if lowered.contains("system memory")
        || lowered.contains("out of memory")
        || lowered.contains("oom")
    {
        "outOfMemory"
    } else if lowered.contains("connection refused") || lowered.contains("failed to connect") {
        "connectionRefused"
    } else {
        "generation"
    };

    (kind.to_string(), err_str.to_string())
}

fn truncate_to_char_boundary(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }

    let mut end = max_bytes.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }

    &text[..end]
}

fn chunk_transcript(text: &str) -> Vec<String> {
    if text.len() <= MAP_CHUNK_CHARS {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0usize;
    let len = text.len();

    while start < len {
        let mut end = (start + MAP_CHUNK_CHARS).min(len);
        while end < len && !text.is_char_boundary(end) {
            end -= 1;
        }

        if end <= start {
            break;
        }

        chunks.push(text[start..end].to_string());
        if end >= len {
            break;
        }

        let mut next_start = end.saturating_sub(MAP_CHUNK_OVERLAP_CHARS);
        while next_start > 0 && !text.is_char_boundary(next_start) {
            next_start -= 1;
        }

        start = if next_start <= start { end } else { next_start };
    }

    chunks
}

fn parse_stream_line(
    line: &str,
    on_token: Option<&Channel<LlmTokenEvent>>,
    accumulated: &mut String,
) -> Result<(), String> {
    let payload: Value = serde_json::from_str(line)
        .map_err(|err| format!("failed to parse Ollama stream line: {err}"))?;

    let text = payload
        .get("response")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let done = payload
        .get("done")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if !text.is_empty() {
        accumulated.push_str(text);
    }

    if let Some(channel) = on_token {
        if !text.is_empty() || done {
            let _ = channel.send(LlmTokenEvent::Token {
                text: text.to_string(),
                done,
            });
        }
    }

    Ok(())
}

async fn run_generate_stream(
    prompt: &str,
    server_url: &str,
    model: &str,
    num_ctx: u64,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .post(format!("{server_url}/api/generate"))
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": true,
            "options": {
                "num_ctx": num_ctx,
                "num_predict": -1
            }
        }))
        .send()
        .await
        .map_err(|err| {
            let message = format!("failed to connect to Ollama: {err}");
            let (kind, raw) = classify_ollama_error(&message);
            let _ = on_token.send(LlmTokenEvent::OllamaError { kind, raw: raw.clone() });
            raw
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let message = format!("Ollama generate failed: {status} {body}");
        let (kind, raw) = classify_ollama_error(&message);
        let _ = on_token.send(LlmTokenEvent::OllamaError {
            kind,
            raw: raw.clone(),
        });
        return Err(raw);
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut accumulated = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("summary stream interrupted: {err}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_index) = buffer.find('\n') {
            let line = buffer[..newline_index].trim().to_string();
            buffer.drain(..=newline_index);
            if line.is_empty() {
                continue;
            }

            parse_stream_line(&line, Some(on_token), &mut accumulated)?;
        }
    }

    let trailing = buffer.trim();
    if !trailing.is_empty() {
        parse_stream_line(trailing, Some(on_token), &mut accumulated)?;
    }

    if let Some(title) = extract_title(&accumulated) {
        let _ = on_token.send(LlmTokenEvent::TitleExtracted { title });
    }

    Ok(accumulated)
}

async fn run_generate_non_stream(
    prompt: &str,
    server_url: &str,
    model: &str,
    num_ctx: u64,
) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .post(format!("{server_url}/api/generate"))
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": {
                "num_ctx": num_ctx,
                "num_predict": -1
            }
        }))
        .send()
        .await
        .map_err(|err| {
            let message = format!("failed to connect to Ollama: {err}");
            let (_, raw) = classify_ollama_error(&message);
            raw
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let message = format!("Ollama generate failed: {status} {body}");
        let (_, raw) = classify_ollama_error(&message);
        return Err(raw);
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|err| format!("failed to decode Ollama response: {err}"))?;

    payload
        .get("response")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "Ollama response did not include generated text".to_string())
}

pub async fn pull_model(
    server_url: &str,
    model: &str,
    on_event: &Channel<OllamaPullEvent>,
) -> Result<(), String> {
    let client = Client::new();
    let response = match client
        .post(format!("{server_url}/api/pull"))
        .json(&serde_json::json!({
            "name": model,
            "stream": true
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            let message = format!("failed to connect to Ollama pull endpoint: {err}");
            send_pull_error(on_event, &message);
            return Err(message);
        }
    };

    if !response.status().is_success() {
        let message = format!("Ollama pull failed with status {}", response.status());
        send_pull_error(on_event, &message);
        return Err(message);
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(err) => {
                let message = format!("model pull stream interrupted: {err}");
                send_pull_error(on_event, &message);
                return Err(message);
            }
        };

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_index) = buffer.find('\n') {
            let line = buffer[..newline_index].trim().to_string();
            buffer.drain(..=newline_index);
            if line.is_empty() {
                continue;
            }

            let payload: Value = match serde_json::from_str(&line) {
                Ok(payload) => payload,
                Err(err) => {
                    let message = format!("invalid pull event payload: {err}");
                    send_pull_error(on_event, &message);
                    return Err(message);
                }
            };

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

            let _ = on_event.send(OllamaPullEvent::Progress {
                status,
                completed,
                total,
            });
        }
    }

    if !buffer.trim().is_empty() {
        let payload: Value = serde_json::from_str(buffer.trim())
            .map_err(|err| format!("invalid trailing pull event payload: {err}"))?;
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
        let _ = on_event.send(OllamaPullEvent::Progress {
            status,
            completed,
            total,
        });
    }

    let _ = on_event.send(OllamaPullEvent::Complete);
    Ok(())
}

fn build_summary_prompt(transcript: &str) -> String {
    format!(
        "You are a meeting notes assistant. Summarize ONLY what is explicitly said in the transcript below. Do NOT invent, assume, or hallucinate any information that is not directly present in the transcript. If the transcript is short or lacks substance, reflect that honestly — write a brief summary and use \"None identified.\" for empty sections.\n\nProduce structured meeting notes in Markdown with exactly these four sections:\n\n## Overview\n[Summarize only what was actually discussed. For very short or minimal transcripts, write 1-2 sentences. For longer meetings, write up to 8-12 sentences. Only mention participants if they are named in the transcript.]\n\n## Key Points\n[Bullet list of the most important facts, insights, or information shared. Only include points explicitly stated in the transcript. If nothing substantive was discussed, write \"None identified.\"]\n\n## Decisions Made\n[Bullet list of decisions that were made during the meeting. Only include decisions explicitly stated. If none, write \"None identified.\"]\n\n## Action Items\n[List ALL action items as: - @[person]: [task] by [deadline]. Only include action items explicitly assigned in the transcript. If no action items were mentioned, write \"None identified.\"]\n\nCRITICAL: Every claim in your summary must be directly traceable to the transcript. If the transcript contains only greetings or filler words, say so. Do NOT fabricate meeting content.\n\nAlso generate a concise meeting title (max 10 words) on the very first line as: TITLE: [title]\n\nTranscript:\n{}",
        transcript
    )
}

pub fn extract_title(full_text: &str) -> Option<String> {
    full_text.lines().find_map(|line| {
        line.strip_prefix("TITLE:")
            .map(str::trim)
            .and_then(|title| {
                if title.is_empty() {
                    None
                } else {
                    Some(title.to_string())
                }
            })
    })
}

pub fn strip_title_line(full_text: &str) -> String {
    full_text
        .lines()
        .filter(|line| !line.trim_start().starts_with("TITLE:"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub async fn generate_summary_stream(
    transcript: &str,
    server_url: &str,
    model: &str,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let model_context_length = query_model_context_length(server_url, model).await;
    let mut transcript_for_prompt = transcript;

    if estimate_tokens(transcript) > model_context_length {
        let available_tokens = model_context_length
            .saturating_sub(PROMPT_OVERHEAD_TOKENS)
            .max(1);
        let max_chars = ((available_tokens as f64) * CHARS_PER_TOKEN_ESTIMATE) as usize;
        transcript_for_prompt = truncate_to_char_boundary(transcript, max_chars.max(1));
        let _ = on_token.send(LlmTokenEvent::ContextTruncated { minutes_covered: 0 });
    }

    let prompt = build_summary_prompt(transcript_for_prompt);
    let num_ctx = choose_num_ctx(model_context_length, transcript_for_prompt);
    run_generate_stream(&prompt, server_url, model, num_ctx, on_token).await
}

pub async fn generate_summary_chunked(
    transcript: &str,
    server_url: &str,
    model: &str,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let chunks = chunk_transcript(transcript);
    let model_context_length = query_model_context_length(server_url, model).await;
    let mut partial_summaries = Vec::with_capacity(chunks.len());

    for chunk in chunks {
        let prompt = build_summary_prompt(&chunk);
        let num_ctx = choose_num_ctx(model_context_length, &chunk);
        partial_summaries.push(run_generate_non_stream(&prompt, server_url, model, num_ctx).await?);
    }

    let stitched = partial_summaries
        .iter()
        .enumerate()
        .map(|(index, partial)| format!("Section {}:\n{}", index + 1, partial))
        .collect::<Vec<_>>()
        .join("\n\n");

    let synthesis_prompt = format!(
        "You are given partial meeting summaries from consecutive sections. Synthesize them into a single coherent summary with the same four-section structure.\n\nYou MUST include every action item from every section below. Do not merge, summarize, or drop any @person assignments. Each action item from each section must appear in the final Action Items list.\n\nThe Overview should be 8-12 sentences since this is a long meeting.\n\nReturn the result in Markdown with:\n- First line as TITLE: [concise title]\n- ## Overview\n- ## Key Points\n- ## Decisions Made\n- ## Action Items\n\nPartial summaries:\n\n{}",
        stitched
    );

    let synthesis_num_ctx = choose_num_ctx(model_context_length, &stitched);
    run_generate_stream(&synthesis_prompt, server_url, model, synthesis_num_ctx, on_token).await
}

pub async fn run_summary(
    transcript: &str,
    server_url: &str,
    model: &str,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let result = if transcript.len() <= MAX_SINGLE_PASS_CHARS {
        generate_summary_stream(transcript, server_url, model, on_token).await
    } else {
        generate_summary_chunked(transcript, server_url, model, on_token).await
    };

    match result {
        Ok(summary) => Ok(summary),
        Err(err) => {
            send_token_error(on_token, &err);
            Err(err)
        }
    }
}

pub async fn save_summary(
    pool: &SqlitePool,
    meeting_id: i64,
    content: &str,
    model: &str,
) -> Result<i64, String> {
    let normalized_model = normalize_model_name(model);

    sqlx::query("DELETE FROM summaries WHERE meeting_id = ?")
        .bind(meeting_id)
        .execute(pool)
        .await
        .map_err(|err| format!("failed to clear existing summary: {err}"))?;

    let result = sqlx::query(
        "INSERT INTO summaries (meeting_id, content, format, llm_provider, llm_model, generated_at)
         VALUES (?, ?, 'markdown', 'ollama', ?, CURRENT_TIMESTAMP)",
    )
    .bind(meeting_id)
    .bind(content)
    .bind(normalized_model)
    .execute(pool)
    .await
    .map_err(|err| format!("failed to save summary: {err}"))?;

    Ok(result.last_insert_rowid())
}

pub async fn get_summary(pool: &SqlitePool, meeting_id: i64) -> Result<Option<SummaryRow>, String> {
    sqlx::query_as::<_, SummaryRow>(
        "SELECT id, meeting_id, content, format, llm_provider, llm_model, generated_at
         FROM summaries
         WHERE meeting_id = ?
         ORDER BY generated_at DESC
         LIMIT 1",
    )
    .bind(meeting_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| format!("failed to fetch summary: {err}"))
}

pub async fn update_summary_content(pool: &SqlitePool, meeting_id: i64, content: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE summaries
         SET content = ?, generated_at = CURRENT_TIMESTAMP
         WHERE meeting_id = ?",
    )
    .bind(content)
    .bind(meeting_id)
    .execute(pool)
    .await
    .map_err(|err| format!("failed to update summary content: {err}"))?;

    Ok(())
}

pub async fn update_meeting_title(pool: &SqlitePool, meeting_id: i64, title: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE meetings
         SET title = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(title)
    .bind(meeting_id)
    .execute(pool)
    .await
    .map_err(|err| format!("failed to update meeting title: {err}"))?;

    Ok(())
}
