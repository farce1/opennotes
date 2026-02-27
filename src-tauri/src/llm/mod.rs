pub mod detect;

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::ipc::Channel;

pub const DEFAULT_MODEL: &str = "phi4-mini";
const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const MAX_SINGLE_PASS_CHARS: usize = 96_000;
const MAP_CHUNK_CHARS: usize = 80_000;
const MAP_CHUNK_OVERLAP_CHARS: usize = 2_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum LlmTokenEvent {
    Token { text: String, done: bool },
    Error { message: String },
    TitleExtracted { title: String },
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

async fn run_generate_stream(prompt: &str, model: &str, on_token: &Channel<LlmTokenEvent>) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .post(format!("{OLLAMA_BASE_URL}/api/generate"))
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": true,
            "options": {
                "num_ctx": 32768
            }
        }))
        .send()
        .await
        .map_err(|err| format!("failed to connect to Ollama: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Ollama generate failed: {status} {body}"));
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

async fn run_generate_non_stream(prompt: &str, model: &str) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .post(format!("{OLLAMA_BASE_URL}/api/generate"))
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": {
                "num_ctx": 32768
            }
        }))
        .send()
        .await
        .map_err(|err| format!("failed to connect to Ollama: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Ollama generate failed: {status} {body}"));
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

pub async fn pull_model(model: &str, on_event: &Channel<OllamaPullEvent>) -> Result<(), String> {
    let client = Client::new();
    let response = match client
        .post(format!("{OLLAMA_BASE_URL}/api/pull"))
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
        "You are a meeting notes assistant. Given the following meeting transcript, produce structured meeting notes in Markdown with exactly these four sections:\n\n## Overview\n[A detailed paragraph (5-8 sentences) covering the main topics discussed, participants mentioned, and key conclusions reached.]\n\n## Key Points\n[Bullet list of the most important facts, insights, or information shared.]\n\n## Decisions Made\n[Bullet list of decisions that were made during the meeting. If none, write \"None identified.\"]\n\n## Action Items\n[List each action item as: - @[person]: [task] by [deadline]. If no deadlines were mentioned, omit the \"by\" clause. If no action items, write \"None identified.\"]\n\nAlso generate a concise meeting title (max 10 words) on the very first line as: TITLE: [title]\n\nTranscript:\n{}",
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
    model: &str,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let prompt = build_summary_prompt(transcript);
    run_generate_stream(&prompt, model, on_token).await
}

pub async fn generate_summary_chunked(
    transcript: &str,
    model: &str,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let chunks = chunk_transcript(transcript);
    let mut partial_summaries = Vec::with_capacity(chunks.len());

    for chunk in chunks {
        let prompt = build_summary_prompt(&chunk);
        partial_summaries.push(run_generate_non_stream(&prompt, model).await?);
    }

    let stitched = partial_summaries
        .iter()
        .enumerate()
        .map(|(index, partial)| format!("Section {}:\n{}", index + 1, partial))
        .collect::<Vec<_>>()
        .join("\n\n");

    let synthesis_prompt = format!(
        "You are given partial meeting summaries from consecutive sections. Synthesize them into a single coherent summary with the same four-section structure.\n\nReturn the result in Markdown with:\n- First line as TITLE: [concise title]\n- ## Overview\n- ## Key Points\n- ## Decisions Made\n- ## Action Items\n\nPartial summaries:\n\n{}",
        stitched
    );

    run_generate_stream(&synthesis_prompt, model, on_token).await
}

pub async fn run_summary(
    transcript: &str,
    model: &str,
    on_token: &Channel<LlmTokenEvent>,
) -> Result<String, String> {
    let result = if transcript.len() <= MAX_SINGLE_PASS_CHARS {
        generate_summary_stream(transcript, model, on_token).await
    } else {
        generate_summary_chunked(transcript, model, on_token).await
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
    .bind(model)
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
