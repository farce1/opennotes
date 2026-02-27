use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager};

use crate::{audio, session, transcription, tray::TrayMenuHandles, widget};

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

pub(crate) fn next_recording_output_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let mut path = PathBuf::from(home);
    path.push(".opennotes");
    path.push("recordings");

    std::fs::create_dir_all(&path).map_err(|err| format!("failed to ensure recordings dir: {err}"))?;

    path.push(format!("{}.ogg", timestamp_string()));
    Ok(path)
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
    session_state: tauri::State<'_, SessionHandle>,
    recording_state: tauri::State<'_, RecordingStateHandle>,
    transcription_state: tauri::State<'_, TranscriptionStateHandle>,
    on_segment: Channel<transcription::TranscriptEvent>,
) -> Result<i64, String> {
    let session_handle = session_state.inner().clone();
    let session_handle_for_start = session_handle.clone();
    let mut coordinator = session_handle
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?;

    coordinator.start(
        &app,
        &pool,
        session_handle_for_start,
        recording_state.inner(),
        transcription_state.inner(),
        on_segment,
    )
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
    let mut coordinator = session_handle
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?;

    coordinator.stop(
        &app,
        &pool,
        recording_state.inner(),
        transcription_state.inner(),
    )
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
    let mut coordinator = session_handle
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?;

    coordinator.pause(
        &app,
        &pool,
        recording_state.inner(),
        transcription_state.inner(),
    )
}

#[tauri::command]
pub async fn resume_session(
    app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    session_state: tauri::State<'_, SessionHandle>,
    recording_state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    let session_handle = session_state.inner().clone();
    let mut coordinator = session_handle
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?;

    coordinator.resume(&app, &pool, recording_state.inner())
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
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    let output_path = next_recording_output_path()?;
    audio::start_recording(&app, output_path)?;
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
    transcription::start_transcription_worker(
        &mut state,
        audio_tx,
        audio_rx,
        on_segment,
        None,
        None,
        None,
    )?;

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
pub async fn check_model_ready() -> Result<bool, String> {
    Ok(transcription::model::check_model_ready())
}

#[tauri::command]
pub async fn download_model(on_event: Channel<crate::download::DownloadEvent>) -> Result<(), String> {
    crate::download::download_model(on_event).await
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
