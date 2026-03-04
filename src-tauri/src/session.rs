use chrono::{DateTime, Local, Utc};
use serde::Serialize;
use sqlx::SqlitePool;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};

use crate::audio;
use crate::commands::{
    next_recording_output_path, set_tray_start_stop_label, update_tray_icon, RecordingStateHandle,
    TranscriptionStateHandle,
};
use crate::transcription::{self, TranscriptEvent};
use crate::widget;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionPhase {
    #[default]
    Idle,
    Recording,
    Paused,
    Stopping,
}

#[derive(Clone, Debug)]
pub struct ActiveSession {
    pub meeting_id: i64,
    pub started_at: DateTime<Utc>,
    pub transcription_degraded: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatePayload {
    pub phase: SessionPhase,
    pub meeting_id: Option<i64>,
    pub transcription_degraded: bool,
    pub started_at: Option<String>,
}

#[derive(Debug, Default)]
pub struct SessionCoordinator {
    pub phase: SessionPhase,
    pub active: Option<ActiveSession>,
}

pub type SessionHandle = Arc<Mutex<SessionCoordinator>>;

pub struct SessionStartArgs {
    pub session_handle: SessionHandle,
    pub recording_state_handle: RecordingStateHandle,
    pub transcription_state_handle: TranscriptionStateHandle,
    pub on_segment: Channel<TranscriptEvent>,
    pub audio_source: Option<String>,
    pub preferred_mic_device: Option<String>,
    pub transcription_language: Option<String>,
}

impl SessionCoordinator {
    pub fn new() -> Self {
        Self {
            phase: SessionPhase::Idle,
            active: None,
        }
    }

    pub fn state_payload(&self) -> SessionStatePayload {
        SessionStatePayload {
            phase: self.phase,
            meeting_id: self.active.as_ref().map(|active| active.meeting_id),
            transcription_degraded: self
                .active
                .as_ref()
                .map(|active| active.transcription_degraded)
                .unwrap_or(false),
            started_at: self
                .active
                .as_ref()
                .map(|active| active.started_at.to_rfc3339()),
        }
    }

    pub fn start(
        &mut self,
        app: &AppHandle,
        pool: &SqlitePool,
        data_dir: &Path,
        args: SessionStartArgs,
    ) -> Result<i64, String> {
        let SessionStartArgs {
            session_handle,
            recording_state_handle,
            transcription_state_handle,
            on_segment,
            audio_source,
            preferred_mic_device,
            transcription_language,
        } = args;

        if !matches!(self.phase, SessionPhase::Idle) {
            return Err("session is already active".to_string());
        }

        let started_at = Utc::now();
        let output_path = next_recording_output_path(data_dir)?;
        let output_path_string = output_path.to_string_lossy().to_string();
        let selected_audio_source = normalize_audio_source(audio_source.as_deref());

        let title = format!(
            "Meeting — {}",
            Local::now().format("%b %-d, %Y, %-I:%M %p")
        );

        let meeting_id = tauri::async_runtime::block_on(async {
            let result = sqlx::query(
                "INSERT INTO meetings (title, started_at, status, audio_path, audio_sources, updated_at)
                 VALUES (?, CURRENT_TIMESTAMP, 'recording', ?, ?, CURRENT_TIMESTAMP)",
            )
            .bind(title)
            .bind(&output_path_string)
            .bind(&selected_audio_source)
            .execute(pool)
            .await?;

            Ok::<i64, sqlx::Error>(result.last_insert_rowid())
        })
        .map_err(|err| format!("failed to create meeting row: {err}"))?;

        if let Err(err) = audio::start_recording(
            app,
            output_path.clone(),
            Some(selected_audio_source.as_str()),
            preferred_mic_device.as_deref(),
        ) {
            let _ = delete_meeting(pool, meeting_id);
            return Err(err);
        }
        let _ = update_audio_sources(pool, meeting_id, &selected_audio_source);

        let (audio_tx, audio_rx) = {
            let mut recording_state = recording_state_handle
                .lock()
                .map_err(|_| "recording state lock poisoned".to_string())?;

            let tx = recording_state
                .transcription_tx
                .clone()
                .ok_or_else(|| "transcription sender unavailable".to_string())?;
            let rx = recording_state
                .transcription_rx
                .take()
                .ok_or_else(|| "transcription receiver unavailable; restart recording".to_string())?;
            (tx, rx)
        };

        let app_for_degraded = app.clone();
        let session_for_degraded = session_handle.clone();
        let degraded_callback: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            if let Ok(mut coordinator) = session_for_degraded.lock() {
                let _ = coordinator.mark_transcription_degraded(&app_for_degraded);
            }
        });

        let transcription_start_result = {
            let mut transcription_state = transcription_state_handle
                .lock()
                .map_err(|_| "transcription state lock poisoned".to_string())?;

            transcription::start_transcription_worker(&mut transcription_state, transcription::StartWorkerArgs {
                audio_tx,
                audio_rx,
                on_segment,
                data_dir: data_dir.to_path_buf(),
                db_pool: Some(pool.clone()),
                meeting_id: Some(meeting_id),
                on_worker_disconnected: Some(degraded_callback),
                language: transcription_language,
            })
        };

        if let Err(err) = transcription_start_result {
            let _ = audio::stop_recording(app);
            let _ = delete_meeting(pool, meeting_id);
            let _ = set_tray_start_stop_label(app, false);
            let _ = update_tray_icon(app.clone(), "idle".to_string());
            widget::hide_widget(app);
            return Err(err);
        }

        self.phase = SessionPhase::Recording;
        self.active = Some(ActiveSession {
            meeting_id,
            started_at,
            transcription_degraded: false,
        });

        let _ = set_tray_start_stop_label(app, true);
        let _ = update_tray_icon(app.clone(), "recording".to_string());
        let _ = widget::show_widget(app);
        let _ = app.emit("recording-started", ());
        let _ = app.emit("transcribing-active", ());
        emit_state_changed(app, &self.state_payload());

        Ok(meeting_id)
    }

    pub fn stop(
        &mut self,
        app: &AppHandle,
        pool: &SqlitePool,
        _recording_state_handle: &RecordingStateHandle,
        transcription_state_handle: &TranscriptionStateHandle,
    ) -> Result<i64, String> {
        if !matches!(self.phase, SessionPhase::Recording | SessionPhase::Paused) {
            return Err("session is not recording".to_string());
        }

        let active_session = self
            .active
            .clone()
            .ok_or_else(|| "session active state is missing".to_string())?;

        self.phase = SessionPhase::Stopping;
        emit_state_changed(app, &self.state_payload());

        {
            let mut transcription_state = transcription_state_handle
                .lock()
                .map_err(|_| "transcription state lock poisoned".to_string())?;
            transcription::stop_transcription_worker(&mut transcription_state);
        }

        let audio_path = match audio::stop_recording(app) {
            Ok(path) => path,
            Err(err) => {
                let _ = mark_meeting_failed(pool, active_session.meeting_id);
                self.phase = SessionPhase::Idle;
                self.active = None;
                emit_state_changed(app, &self.state_payload());
                widget::hide_widget(app);
                let _ = set_tray_start_stop_label(app, false);
                let _ = update_tray_icon(app.clone(), "idle".to_string());
                let _ = app.emit("recording-stopped", ());
                let _ = app.emit("transcribing-inactive", ());
                return Err(format!("failed to stop audio capture: {err}"));
            }
        };

        let ended_at = Utc::now();
        let duration_seconds = (ended_at - active_session.started_at)
            .num_seconds()
            .max(0);

        tauri::async_runtime::block_on(async {
            sqlx::query(
                "UPDATE meetings
                 SET status = 'completed', ended_at = CURRENT_TIMESTAMP,
                     duration_seconds = ?, audio_path = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?",
            )
            .bind(duration_seconds)
            .bind(audio_path.to_string_lossy().to_string())
            .bind(active_session.meeting_id)
            .execute(pool)
            .await
        })
        .map_err(|err| format!("failed to finalize meeting row: {err}"))?;

        std::thread::sleep(std::time::Duration::from_millis(300));
        tauri::async_runtime::block_on(async {
            if let Err(err) = crate::commands::fts_upsert(pool, active_session.meeting_id).await {
                eprintln!("[fts] upsert after session stop failed: {err}");
            }
        });

        self.phase = SessionPhase::Idle;
        self.active = None;

        emit_state_changed(app, &self.state_payload());
        let _ = app.emit("session-complete", active_session.meeting_id);
        let _ = app.emit("recording-stopped", ());
        let _ = app.emit("transcribing-inactive", ());
        widget::hide_widget(app);
        let _ = set_tray_start_stop_label(app, false);
        let _ = update_tray_icon(app.clone(), "idle".to_string());

        Ok(active_session.meeting_id)
    }

    pub fn pause(
        &mut self,
        app: &AppHandle,
        pool: &SqlitePool,
        _recording_state_handle: &RecordingStateHandle,
        transcription_state_handle: &TranscriptionStateHandle,
    ) -> Result<(), String> {
        if !matches!(self.phase, SessionPhase::Recording) {
            return Err("session is not currently recording".to_string());
        }

        audio::pause_recording(app)?;

        if let Ok(transcription_state) = transcription_state_handle.lock() {
            transcription::flush_transcription(&transcription_state);
        }

        if let Some(active) = self.active.as_ref() {
            let _ = update_meeting_status(pool, active.meeting_id, "paused");
        }

        self.phase = SessionPhase::Paused;
        let _ = app.emit("recording-paused", ());
        emit_state_changed(app, &self.state_payload());
        Ok(())
    }

    pub fn resume(
        &mut self,
        app: &AppHandle,
        pool: &SqlitePool,
        _recording_state_handle: &RecordingStateHandle,
    ) -> Result<(), String> {
        if !matches!(self.phase, SessionPhase::Paused) {
            return Err("session is not paused".to_string());
        }

        audio::resume_recording(app)?;

        if let Some(active) = self.active.as_ref() {
            let _ = update_meeting_status(pool, active.meeting_id, "recording");
        }

        self.phase = SessionPhase::Recording;
        let _ = app.emit("recording-resumed", ());
        emit_state_changed(app, &self.state_payload());
        Ok(())
    }

    pub fn mark_transcription_degraded(&mut self, app: &AppHandle) -> Result<(), String> {
        let Some(active) = self.active.as_mut() else {
            return Ok(());
        };

        if active.transcription_degraded {
            return Ok(());
        }

        active.transcription_degraded = true;
        let _ = app.emit("transcribing-inactive", ());
        emit_state_changed(app, &self.state_payload());
        Ok(())
    }
}

pub async fn recover_incomplete_sessions(pool: &SqlitePool, app: &AppHandle) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE meetings
         SET status = 'recovered', updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('recording', 'paused')",
    )
    .execute(pool)
    .await?;

    let recovered_count = result.rows_affected();
    if recovered_count > 0 {
        let _ = app.emit("sessions-recovered", recovered_count);
    }

    Ok(recovered_count)
}

fn emit_state_changed(app: &AppHandle, payload: &SessionStatePayload) {
    let _ = app.emit("session-state-changed", payload.clone());
}

fn normalize_audio_source(audio_source: Option<&str>) -> String {
    match audio_source.unwrap_or("both").trim().to_lowercase().as_str() {
        "mic" => "mic".to_string(),
        "system" => "system".to_string(),
        _ => "both".to_string(),
    }
}

fn update_audio_sources(pool: &SqlitePool, meeting_id: i64, sources: &str) -> Result<(), String> {
    tauri::async_runtime::block_on(async {
        sqlx::query(
            "UPDATE meetings
             SET audio_sources = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?",
        )
        .bind(sources)
        .bind(meeting_id)
        .execute(pool)
        .await
    })
    .map_err(|err| format!("failed to update meeting audio sources: {err}"))?;

    Ok(())
}

fn update_meeting_status(pool: &SqlitePool, meeting_id: i64, status: &str) -> Result<(), String> {
    tauri::async_runtime::block_on(async {
        sqlx::query(
            "UPDATE meetings
             SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?",
        )
        .bind(status)
        .bind(meeting_id)
        .execute(pool)
        .await
    })
    .map_err(|err| format!("failed to update meeting status: {err}"))?;

    Ok(())
}

fn delete_meeting(pool: &SqlitePool, meeting_id: i64) -> Result<(), String> {
    tauri::async_runtime::block_on(async {
        sqlx::query("DELETE FROM meetings WHERE id = ?")
            .bind(meeting_id)
            .execute(pool)
            .await
    })
    .map_err(|err| format!("failed to rollback meeting row: {err}"))?;

    Ok(())
}

fn mark_meeting_failed(pool: &SqlitePool, meeting_id: i64) -> Result<(), String> {
    tauri::async_runtime::block_on(async {
        sqlx::query(
            "UPDATE meetings
             SET status = 'failed', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?",
        )
        .bind(meeting_id)
        .execute(pool)
        .await
    })
    .map_err(|err| format!("failed to update meeting status to failed: {err}"))?;

    Ok(())
}
