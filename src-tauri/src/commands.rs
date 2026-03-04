use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager};

use crate::{audio, download, llm, session, transcription, tray::TrayMenuHandles, widget, DataDir};

pub type RecordingStateHandle = Arc<Mutex<audio::RecordingState>>;
pub type TranscriptionStateHandle = Arc<Mutex<transcription::TranscriptionState>>;
pub type SessionHandle = session::SessionHandle;

#[derive(Serialize)]
pub struct PermissionStatus {
    pub mic: String,
    pub screen_recording: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct TranscriptRow {
    pub segment_index: i64,
    pub text: String,
    pub start_time_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelInfo {
    pub name: String,
    pub parameter_size: Option<String>,
    pub download_size: Option<String>,
}

fn timestamp_string() -> String {
    if let Ok(output) = std::process::Command::new("date")
        .arg("+%Y%m%d_%H%M%S")
        .output()
    {
        if output.status.success() {
            if let Ok(value) = String::from_utf8(output.stdout) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("recording_{epoch}")
}

pub(crate) fn next_recording_output_path(data_dir: &Path) -> Result<PathBuf, String> {
    let mut path = data_dir.to_path_buf();
    path.push("recordings");

    std::fs::create_dir_all(&path).map_err(|err| format!("failed to ensure recordings dir: {err}"))?;

    path.push(format!("{}.ogg", timestamp_string()));
    Ok(path)
}

fn sqlite_path_literal(path: &std::path::Path) -> String {
    path.display().to_string().replace('\'', "''")
}

fn format_size_bytes(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;

    let bytes_f = bytes as f64;
    if bytes_f >= GB {
        let gb = bytes_f / GB;
        if gb >= 10.0 {
            return format!("{:.0}GB", gb.round());
        }
        return format!("{gb:.1}GB");
    }

    let mb = bytes_f / MB;
    if mb >= 10.0 {
        return format!("{:.0}MB", mb.round());
    }
    format!("{mb:.1}MB")
}

async fn fts_row_exists(pool: &SqlitePool, meeting_id: i64) -> Result<bool, String> {
    let exists = sqlx::query_scalar::<_, i64>(
        "SELECT EXISTS(
            SELECT 1
            FROM meetings_fts
            WHERE rowid = ?
        )",
    )
    .bind(meeting_id)
    .fetch_one(pool)
    .await
    .map_err(|err| format!("FTS existence check failed: {err}"))?;

    Ok(exists != 0)
}

async fn fts_delete_if_exists(pool: &SqlitePool, meeting_id: i64) -> Result<(), String> {
    if !fts_row_exists(pool, meeting_id).await? {
        return Ok(());
    }

    sqlx::query("INSERT INTO meetings_fts(meetings_fts, rowid) VALUES ('delete', ?)")
        .bind(meeting_id)
        .execute(pool)
        .await
        .map_err(|err| format!("FTS delete failed: {err}"))?;

    Ok(())
}

pub(crate) async fn fts_upsert(pool: &SqlitePool, meeting_id: i64) -> Result<(), String> {
    fts_delete_if_exists(pool, meeting_id).await?;

    sqlx::query(
        "INSERT INTO meetings_fts(rowid, title, transcript_text)
         SELECT m.id, m.title,
                COALESCE((
                    SELECT GROUP_CONCAT(t.text, ' ')
                    FROM transcripts t
                    WHERE t.meeting_id = m.id
                    ORDER BY t.segment_index
                ), '')
                || ' '
                || COALESCE((
                    SELECT s.content
                    FROM summaries s
                    WHERE s.meeting_id = m.id
                    LIMIT 1
                ), '')
         FROM meetings m
         WHERE m.id = ? AND m.deleted_at IS NULL",
    )
    .bind(meeting_id)
    .execute(pool)
    .await
    .map_err(|err| format!("FTS insert failed: {err}"))?;

    Ok(())
}

pub(crate) fn set_tray_start_stop_label(app: &AppHandle, is_recording: bool) -> Result<(), String> {
    if let Some(handles) = app.try_state::<TrayMenuHandles>() {
        let text = if is_recording {
            "Stop Recording"
        } else {
            "Start Recording"
        };
        handles.start_stop.set_text(text).map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn update_tray_icon(app: AppHandle, state: String) -> Result<(), String> {
    let tooltip = match state.as_str() {
        "recording" => "openNotes - Recording",
        "processing" => "openNotes - Processing",
        _ => "openNotes",
    };

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn start_session(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    data_dir: tauri::State<'_, DataDir>,
    on_segment: Channel<transcription::TranscriptEvent>,
    audio_source: Option<String>,
    preferred_mic_device: Option<String>,
) -> Result<i64, String> {
    let session_handle = app.state::<SessionHandle>().inner().clone();
    let session_handle_for_start = session_handle.clone();
    let pool = pool.inner().clone();
    let data_dir = data_dir.inner().0.clone();
    let recording_state = app.state::<RecordingStateHandle>().inner().clone();
    let transcription_state = app.state::<TranscriptionStateHandle>().inner().clone();

    tokio::task::spawn_blocking(move || {
        let mut coordinator = session_handle
            .lock()
            .map_err(|_| "session state lock poisoned".to_string())?;

        coordinator.start(&app, &pool, data_dir.as_path(), session::SessionStartArgs {
            session_handle: session_handle_for_start,
            recording_state_handle: recording_state,
            transcription_state_handle: transcription_state,
            on_segment,
            audio_source,
            preferred_mic_device,
        })
    })
    .await
    .map_err(|err| format!("session start task failed: {err}"))?
}

#[tauri::command]
pub async fn stop_session(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    session_state: tauri::State<'_, SessionHandle>,
    recording_state: tauri::State<'_, RecordingStateHandle>,
    transcription_state: tauri::State<'_, TranscriptionStateHandle>,
) -> Result<i64, String> {
    let session_handle = session_state.inner().clone();
    let pool = pool.inner().clone();
    let recording_state = recording_state.inner().clone();
    let transcription_state = transcription_state.inner().clone();

    tokio::task::spawn_blocking(move || {
        let mut coordinator = session_handle
            .lock()
            .map_err(|_| "session state lock poisoned".to_string())?;

        coordinator.stop(
            &app,
            &pool,
            &recording_state,
            &transcription_state,
        )
    })
    .await
    .map_err(|err| format!("session stop task failed: {err}"))?
}

#[tauri::command]
pub async fn retry_post_processing(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
) -> Result<(), String> {
    let pool = pool.inner().clone();
    session::retry_post_processing_inner(&app, &pool, meeting_id).await
}

#[tauri::command]
pub async fn pause_session(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    session_state: tauri::State<'_, SessionHandle>,
    recording_state: tauri::State<'_, RecordingStateHandle>,
    transcription_state: tauri::State<'_, TranscriptionStateHandle>,
) -> Result<(), String> {
    let session_handle = session_state.inner().clone();
    let pool = pool.inner().clone();
    let recording_state = recording_state.inner().clone();
    let transcription_state = transcription_state.inner().clone();

    tokio::task::spawn_blocking(move || {
        let mut coordinator = session_handle
            .lock()
            .map_err(|_| "session state lock poisoned".to_string())?;

        coordinator.pause(
            &app,
            &pool,
            &recording_state,
            &transcription_state,
        )
    })
    .await
    .map_err(|err| format!("session pause task failed: {err}"))?
}

#[tauri::command]
pub async fn resume_session(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    session_state: tauri::State<'_, SessionHandle>,
    recording_state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    let session_handle = session_state.inner().clone();
    let pool = pool.inner().clone();
    let recording_state = recording_state.inner().clone();

    tokio::task::spawn_blocking(move || {
        let mut coordinator = session_handle
            .lock()
            .map_err(|_| "session state lock poisoned".to_string())?;

        coordinator.resume(&app, &pool, &recording_state)
    })
    .await
    .map_err(|err| format!("session resume task failed: {err}"))?
}

#[tauri::command]
pub async fn get_session_state(
    session_state: tauri::State<'_, SessionHandle>,
) -> Result<session::SessionStatePayload, String> {
    let session_handle = session_state.inner().clone();
    let coordinator = session_handle
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?;

    Ok(coordinator.state_payload())
}

#[tauri::command]
pub async fn get_transcript_page(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
    offset: i64,
    limit: i64,
) -> Result<Vec<TranscriptRow>, String> {
    sqlx::query_as::<_, TranscriptRow>(
        "SELECT segment_index, text, start_time_ms
         FROM transcripts
         WHERE meeting_id = ?
         ORDER BY segment_index
         LIMIT ? OFFSET ?",
    )
    .bind(meeting_id)
    .bind(limit.max(1))
    .bind(offset.max(0))
    .fetch_all(pool.inner())
    .await
    .map_err(|err| format!("failed to load transcript page: {err}"))
}

#[tauri::command]
pub async fn retranscribe_meeting(meeting_id: i64) -> Result<(), String> {
    eprintln!("[retranscribe] requested for meeting_id={meeting_id} — not yet implemented");
    Err("Re-transcription is not yet available. Coming in a future update.".to_string())
}

#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    data_dir: tauri::State<'_, DataDir>,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    let output_path = next_recording_output_path(data_dir.inner().0.as_path())?;
    audio::start_recording(&app, output_path, None, None)?;
    widget::show_widget(&app).map_err(|err| err.to_string())?;
    set_tray_start_stop_label(&app, true)?;
    update_tray_icon(app.clone(), "recording".to_string())?;
    let _ = app.emit("recording-started", ());
    Ok(())
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<String, String> {
    let output_path = audio::stop_recording(&app)?;
    widget::hide_widget(&app);
    set_tray_start_stop_label(&app, false)?;
    update_tray_icon(app.clone(), "idle".to_string())?;
    let _ = app.emit("recording-stopped", ());
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn pause_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
    transcription_state: tauri::State<'_, TranscriptionStateHandle>,
) -> Result<(), String> {
    audio::pause_recording(&app)?;

    if let Ok(state) = transcription_state.lock() {
        transcription::flush_transcription(&state);
    }

    Ok(())
}

#[tauri::command]
pub async fn resume_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    audio::resume_recording(&app)
}

#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    data_dir: tauri::State<'_, DataDir>,
    recording_state: tauri::State<'_, RecordingStateHandle>,
    transcription_state: tauri::State<'_, TranscriptionStateHandle>,
    on_segment: Channel<transcription::TranscriptEvent>,
) -> Result<(), String> {
    {
        let state = transcription_state
            .lock()
            .map_err(|_| "transcription state lock poisoned".to_string())?;
        if state.worker_handle.is_some() {
            let _ = app.emit("transcribing-active", ());
            return Ok(());
        }
    }

    let (audio_tx, audio_rx) = {
        let mut state = recording_state
            .lock()
            .map_err(|_| "recording state lock poisoned".to_string())?;

        if !state.is_recording.load(Ordering::SeqCst) {
            return Err("recording must be active before starting transcription".to_string());
        }

        let audio_tx = state
            .transcription_tx
            .clone()
            .ok_or_else(|| "transcription sender unavailable".to_string())?;
        let audio_rx = state
            .transcription_rx
            .take()
            .ok_or_else(|| "transcription receiver unavailable; restart recording".to_string())?;

        (audio_tx, audio_rx)
    };

    let mut state = transcription_state
        .lock()
        .map_err(|_| "transcription state lock poisoned".to_string())?;
    transcription::start_transcription_worker(&mut state, transcription::StartWorkerArgs {
        audio_tx,
        audio_rx,
        on_segment,
        data_dir: data_dir.inner().0.clone(),
        db_pool: None,
        meeting_id: None,
        on_worker_disconnected: None,
    })?;

    let _ = app.emit("transcribing-active", ());
    Ok(())
}

#[tauri::command]
pub async fn stop_transcription(
    app: AppHandle,
    transcription_state: tauri::State<'_, TranscriptionStateHandle>,
) -> Result<(), String> {
    let mut state = transcription_state
        .lock()
        .map_err(|_| "transcription state lock poisoned".to_string())?;
    transcription::stop_transcription_worker(&mut state);
    let _ = app.emit("transcribing-inactive", ());
    Ok(())
}

#[tauri::command]
pub async fn check_model_ready(
    data_dir: tauri::State<'_, DataDir>,
) -> Result<bool, String> {
    Ok(transcription::model::check_model_ready(data_dir.inner().0.as_path()))
}

#[tauri::command]
pub async fn download_model(
    data_dir: tauri::State<'_, DataDir>,
    cancel_flag: tauri::State<'_, download::DownloadCancelFlag>,
    on_event: Channel<crate::download::DownloadEvent>,
) -> Result<(), String> {
    crate::download::download_model(
        on_event,
        data_dir.inner().0.join("models"),
        cancel_flag.inner().clone(),
    )
    .await
}

#[tauri::command]
pub async fn cancel_download(
    data_dir: tauri::State<'_, DataDir>,
    cancel_flag: tauri::State<'_, download::DownloadCancelFlag>,
) -> Result<(), String> {
    cancel_flag.store(true, Ordering::SeqCst);

    let models_dir = data_dir.inner().0.join("models");
    if let Ok(entries) = std::fs::read_dir(&models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("tmp") {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<String>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|err| format!("failed to enumerate input devices: {err}"))?;

    Ok(devices.filter_map(|device| device.description().ok().map(|desc| desc.name().to_string())).collect())
}

#[tauri::command]
pub async fn list_ollama_models(server_url: Option<String>) -> Result<Vec<OllamaModelInfo>, String> {
    let base = server_url.unwrap_or_else(|| "http://localhost:11434".to_string());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map_err(|err| format!("cannot reach Ollama: {err}"))?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    #[derive(serde::Deserialize)]
    struct TagsResponse {
        models: Vec<ModelTag>,
    }

    #[derive(serde::Deserialize)]
    struct ModelTag {
        name: String,
        size: Option<u64>,
        details: Option<ModelTagDetails>,
    }

    #[derive(serde::Deserialize)]
    struct ModelTagDetails {
        parameter_size: Option<String>,
    }

    let payload: TagsResponse = response
        .json()
        .await
        .map_err(|err| format!("failed to parse model list: {err}"))?;

    Ok(payload
        .models
        .into_iter()
        .map(|model| OllamaModelInfo {
            name: model.name,
            parameter_size: model.details.and_then(|details| details.parameter_size),
            download_size: model.size.map(format_size_bytes),
        })
        .collect())
}

#[tauri::command]
pub async fn delete_ollama_model(server_url: Option<String>, model: String) -> Result<(), String> {
    let base = server_url.unwrap_or_else(|| "http://localhost:11434".to_string());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|err| err.to_string())?;

    client
        .delete(format!("{base}/api/delete"))
        .json(&serde_json::json!({ "name": model }))
        .send()
        .await
        .map_err(|err| format!("failed to delete model: {err}"))?;

    Ok(())
}

#[tauri::command]
pub async fn update_recording_shortcut(
    app: AppHandle,
    old_shortcut: String,
    new_shortcut: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let old_shortcut = normalize_shortcut_for_tauri(old_shortcut.as_str());
    let new_shortcut = normalize_shortcut_for_tauri(new_shortcut.as_str());

    let _ = app.global_shortcut().unregister(old_shortcut.as_str());

    register_shortcut_event(&app, new_shortcut.as_str(), "recording-toggle")
}

#[tauri::command]
pub async fn update_pause_shortcut(
    app: AppHandle,
    old_shortcut: String,
    new_shortcut: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let old_shortcut = normalize_shortcut_for_tauri(old_shortcut.as_str());
    let new_shortcut = normalize_shortcut_for_tauri(new_shortcut.as_str());

    let _ = app.global_shortcut().unregister(old_shortcut.as_str());

    register_shortcut_event(&app, new_shortcut.as_str(), "recording-pause-toggle")
}

fn normalize_shortcut_for_tauri(shortcut: &str) -> String {
    shortcut
        .to_lowercase()
        .replace("commandorcontrol", "cmdorcontrol")
}

fn register_shortcut_event(
    app: &AppHandle,
    shortcut: &str,
    event_name: &'static str,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Released {
                let _ = app.emit(event_name, ());
            }
        })
        .map_err(|err| format!("failed to register shortcut: {err}"))
}

#[tauri::command]
pub async fn auto_setup_ollama(
    server_url: Option<String>,
    model: Option<String>,
    on_event: Channel<llm::setup::OllamaSetupEvent>,
) -> Result<(), String> {
    let url = server_url.unwrap_or_else(|| llm::DEFAULT_OLLAMA_URL.to_string());
    let selected_model = model.unwrap_or_else(|| llm::DEFAULT_MODEL.to_string());
    llm::setup::auto_setup_ollama(&url, &selected_model, &on_event).await
}

#[tauri::command]
pub async fn check_ollama_status(
    server_url: Option<String>,
    model: Option<String>,
) -> Result<llm::detect::OllamaStatus, String> {
    let url = server_url.unwrap_or_else(|| llm::DEFAULT_OLLAMA_URL.to_string());
    let model_name = model.unwrap_or_else(|| llm::DEFAULT_MODEL.to_string());
    Ok(llm::detect::full_status(&url, &model_name).await)
}

#[tauri::command]
pub async fn pull_ollama_model(
    server_url: Option<String>,
    model: Option<String>,
    on_event: Channel<llm::OllamaPullEvent>,
) -> Result<(), String> {
    let url = server_url.unwrap_or_else(|| llm::DEFAULT_OLLAMA_URL.to_string());
    let selected_model = model.unwrap_or_else(|| llm::DEFAULT_MODEL.to_string());
    llm::pull_model(&url, &selected_model, &on_event).await
}

#[tauri::command]
pub async fn generate_summary(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
    server_url: Option<String>,
    model: Option<String>,
    language: Option<String>,
    template_prompt: Option<String>,
    on_token: Channel<llm::LlmTokenEvent>,
) -> Result<(), String> {
    let transcript_parts = sqlx::query_scalar::<_, String>(
        "SELECT text
         FROM transcripts
         WHERE meeting_id = ?
         ORDER BY segment_index",
    )
    .bind(meeting_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|err| format!("failed to load transcript for summary generation: {err}"))?;

    if transcript_parts.is_empty() {
        return Err("meeting has no transcript text to summarize".to_string());
    }

    let transcript = transcript_parts.join("\n");
    let url = server_url.unwrap_or_else(|| llm::DEFAULT_OLLAMA_URL.to_string());
    let selected_model = model.unwrap_or_else(|| llm::DEFAULT_MODEL.to_string());
    let summary_language = language.as_deref().unwrap_or("en");
    let full_summary = llm::run_summary(
        &transcript,
        &url,
        &selected_model,
        summary_language,
        template_prompt.as_deref(),
        &on_token,
    )
    .await?;
    let extracted_title = llm::extract_title(&full_summary);
    let cleaned_summary = llm::strip_title_line(&full_summary).trim().to_string();
    let persisted_summary = if cleaned_summary.is_empty() {
        full_summary
    } else {
        cleaned_summary
    };

    llm::save_summary(pool.inner(), meeting_id, &persisted_summary, &selected_model).await?;

    if let Some(title) = extracted_title {
        llm::update_meeting_title(pool.inner(), meeting_id, &title).await?;
    }

    if let Err(err) = fts_upsert(pool.inner(), meeting_id).await {
        eprintln!("[fts] upsert after summary generation failed: {err}");
    }

    Ok(())
}

#[tauri::command]
pub async fn get_summary(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
) -> Result<Option<llm::SummaryRow>, String> {
    llm::get_summary(pool.inner(), meeting_id).await
}

#[tauri::command]
pub async fn save_summary(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
    content: String,
) -> Result<i64, String> {
    let id = if let Some(existing) = llm::get_summary(pool.inner(), meeting_id).await? {
        llm::update_summary_content(pool.inner(), meeting_id, &content).await?;
        existing.id
    } else {
        llm::save_summary(pool.inner(), meeting_id, &content, "manual").await?
    };

    if let Err(err) = fts_upsert(pool.inner(), meeting_id).await {
        eprintln!("[fts] upsert after manual summary save failed: {err}");
    }

    Ok(id)
}

#[tauri::command]
pub async fn update_meeting_title(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
    title: String,
) -> Result<(), String> {
    llm::update_meeting_title(pool.inner(), meeting_id, &title).await?;
    fts_upsert(pool.inner(), meeting_id).await
}

#[tauri::command]
pub async fn soft_delete_meeting(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE meetings
         SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(meeting_id)
    .execute(pool.inner())
    .await
    .map_err(|err| format!("failed to soft-delete meeting: {err}"))?;

    fts_delete_if_exists(pool.inner(), meeting_id)
        .await
        .map_err(|err| format!("FTS cleanup on delete failed: {err}"))?;

    Ok(())
}

#[tauri::command]
pub async fn restore_meeting(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE meetings
         SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(meeting_id)
    .execute(pool.inner())
    .await
    .map_err(|err| format!("failed to restore meeting: {err}"))?;

    fts_upsert(pool.inner(), meeting_id).await
}

#[tauri::command]
pub async fn delete_meeting_permanently(
    pool: tauri::State<'_, SqlitePool>,
    meeting_id: i64,
) -> Result<(), String> {
    fts_delete_if_exists(pool.inner(), meeting_id)
        .await
        .map_err(|err| format!("FTS cleanup before permanent delete failed: {err}"))?;

    let result = sqlx::query("DELETE FROM meetings WHERE id = ?")
        .bind(meeting_id)
        .execute(pool.inner())
        .await
        .map_err(|err| format!("failed to permanently delete meeting: {err}"))?;

    if result.rows_affected() == 0 {
        return Err("meeting not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn empty_trash(pool: tauri::State<'_, SqlitePool>) -> Result<u64, String> {
    let trashed_ids = sqlx::query_scalar::<_, i64>(
        "SELECT id
         FROM meetings
         WHERE deleted_at IS NOT NULL",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|err| format!("failed to list trashed meetings: {err}"))?;

    for meeting_id in trashed_ids {
        fts_delete_if_exists(pool.inner(), meeting_id)
            .await
            .map_err(|err| format!("FTS cleanup while emptying trash failed: {err}"))?;
    }

    let result = sqlx::query(
        "DELETE FROM meetings
         WHERE deleted_at IS NOT NULL",
    )
    .execute(pool.inner())
    .await
    .map_err(|err| format!("failed to empty trash: {err}"))?;

    Ok(result.rows_affected())
}

#[tauri::command]
pub async fn purge_old_trash(pool: tauri::State<'_, SqlitePool>) -> Result<u64, String> {
    let result = sqlx::query(
        "DELETE FROM meetings
         WHERE deleted_at IS NOT NULL
           AND deleted_at < datetime('now', '-30 days')",
    )
    .execute(pool.inner())
    .await
    .map_err(|err| format!("failed to purge old trash: {err}"))?;

    Ok(result.rows_affected())
}

#[tauri::command]
pub async fn backup_library(
    pool: tauri::State<'_, SqlitePool>,
    data_dir: tauri::State<'_, DataDir>,
    destination: String,
) -> Result<(), String> {
    use std::io::Write;

    let base_data_dir = data_dir.inner().0.clone();
    let recordings_dir = base_data_dir.join("recordings");
    let snapshot_path = base_data_dir.join("data.snapshot.db");
    let escaped_snapshot = sqlite_path_literal(&snapshot_path);

    sqlx::query(&format!("VACUUM INTO '{escaped_snapshot}'"))
        .execute(pool.inner())
        .await
        .map_err(|err| format!("VACUUM INTO failed: {err}"))?;

    let backup_result = (|| -> Result<(), String> {
        let destination_file =
            std::fs::File::create(&destination).map_err(|err| format!("cannot create backup file: {err}"))?;
        let mut zip_writer = zip::ZipWriter::new(destination_file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip_writer
            .start_file("data.db", options)
            .map_err(|err| format!("failed to start data.db entry: {err}"))?;
        let db_bytes = std::fs::read(&snapshot_path)
            .map_err(|err| format!("failed to read db snapshot for backup: {err}"))?;
        zip_writer
            .write_all(&db_bytes)
            .map_err(|err| format!("failed to write data.db backup entry: {err}"))?;

        if recordings_dir.exists() {
            for entry in std::fs::read_dir(&recordings_dir)
                .map_err(|err| format!("failed to read recordings directory: {err}"))?
            {
                let entry = entry.map_err(|err| format!("failed to access recording entry: {err}"))?;
                if !entry
                    .file_type()
                    .map_err(|err| format!("failed to inspect recording entry: {err}"))?
                    .is_file()
                {
                    continue;
                }

                let file_name = entry.file_name().to_string_lossy().to_string();
                zip_writer
                    .start_file(format!("recordings/{file_name}"), options)
                    .map_err(|err| format!("failed to start recording backup entry: {err}"))?;
                let bytes = std::fs::read(entry.path())
                    .map_err(|err| format!("failed to read recording file for backup: {err}"))?;
                zip_writer
                    .write_all(&bytes)
                    .map_err(|err| format!("failed to write recording backup entry: {err}"))?;
            }
        }

        zip_writer
            .finish()
            .map_err(|err| format!("failed to finalize backup archive: {err}"))?;

        Ok(())
    })();

    let _ = std::fs::remove_file(&snapshot_path);
    backup_result
}

#[tauri::command]
pub async fn restore_library(
    _pool: tauri::State<'_, SqlitePool>,
    data_dir: tauri::State<'_, DataDir>,
    source: String,
) -> Result<(), String> {
    use std::io::{Read, Write};

    let base_data_dir = data_dir.inner().0.clone();
    let recordings_dir = base_data_dir.join("recordings");
    std::fs::create_dir_all(&recordings_dir)
        .map_err(|err| format!("failed to ensure recordings directory: {err}"))?;

    let source_file = std::fs::File::open(&source).map_err(|err| format!("cannot open backup file: {err}"))?;
    let mut archive =
        zip::ZipArchive::new(source_file).map_err(|err| format!("invalid backup archive: {err}"))?;

    for index in 0..archive.len() {
        let mut archive_file = archive
            .by_index(index)
            .map_err(|err| format!("failed to read backup entry: {err}"))?;
        if archive_file.is_dir() {
            continue;
        }

        let name = archive_file.name().to_string();
        if name == "data.db" {
            let destination = base_data_dir.join("data.db.restored");
            let mut out =
                std::fs::File::create(&destination).map_err(|err| format!("failed to write restored db: {err}"))?;
            let mut buffer = Vec::new();
            archive_file
                .read_to_end(&mut buffer)
                .map_err(|err| format!("failed to read backup db entry: {err}"))?;
            out.write_all(&buffer)
                .map_err(|err| format!("failed to persist restored db: {err}"))?;
            continue;
        }

        if let Some(relative) = name.strip_prefix("recordings/") {
            if relative.is_empty() {
                continue;
            }

            let relative_path = PathBuf::from(relative);
            if relative_path.is_absolute()
                || relative_path.components().any(|component| {
                    matches!(
                        component,
                        std::path::Component::ParentDir
                            | std::path::Component::RootDir
                            | std::path::Component::Prefix(_)
                    )
                })
            {
                continue;
            }

            let destination = recordings_dir.join(relative_path);
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|err| format!("failed to create restore path: {err}"))?;
            }

            let mut out = std::fs::File::create(&destination)
                .map_err(|err| format!("failed to write restored recording: {err}"))?;
            let mut buffer = Vec::new();
            archive_file
                .read_to_end(&mut buffer)
                .map_err(|err| format!("failed to read backup recording entry: {err}"))?;
            out.write_all(&buffer)
                .map_err(|err| format!("failed to persist restored recording: {err}"))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn check_audio_permissions() -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let mic = if tauri_plugin_macos_permissions::check_microphone_permission().await {
            "granted"
        } else {
            "denied"
        };

        let screen_recording =
            if tauri_plugin_macos_permissions::check_screen_recording_permission().await {
                "granted"
            } else {
                "denied"
            };

        Ok(PermissionStatus {
            mic: mic.to_string(),
            screen_recording: screen_recording.to_string(),
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(PermissionStatus {
            mic: "granted".to_string(),
            screen_recording: "granted".to_string(),
        })
    }
}

#[tauri::command]
pub fn update_tray_recording_state(app: AppHandle, is_recording: bool) -> Result<(), String> {
    set_tray_start_stop_label(&app, is_recording)?;
    if is_recording {
        update_tray_icon(app, "recording".to_string())
    } else {
        update_tray_icon(app, "idle".to_string())
    }
}
