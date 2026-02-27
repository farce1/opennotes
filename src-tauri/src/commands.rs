use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::AppHandle;

use crate::audio;

pub type RecordingStateHandle = Arc<Mutex<audio::RecordingState>>;

#[derive(Serialize)]
pub struct PermissionStatus {
    pub mic: String,
    pub screen_recording: String,
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

fn next_recording_output_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let mut path = PathBuf::from(home);
    path.push(".opennotes");
    path.push("recordings");

    std::fs::create_dir_all(&path).map_err(|err| format!("failed to ensure recordings dir: {err}"))?;

    path.push(format!("{}.ogg", timestamp_string()));
    Ok(path)
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
pub async fn start_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    let output_path = next_recording_output_path()?;
    audio::start_recording(&app, output_path)
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<String, String> {
    let output_path = audio::stop_recording(&app)?;
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn pause_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    audio::pause_recording(&app)
}

#[tauri::command]
pub async fn resume_recording(
    app: AppHandle,
    _state: tauri::State<'_, RecordingStateHandle>,
) -> Result<(), String> {
    audio::resume_recording(&app)
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
