pub mod decode;
pub mod model;
pub mod worker;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum DiarizationEvent {
    Progress { percent: u8 },
    Complete,
    Error { message: String },
}

#[derive(Default)]
pub struct DiarizationState {
    pub running_meeting_id: Option<i64>,
}

pub fn start_diarization_inner(
    pool: SqlitePool,
    data_dir: PathBuf,
    meeting_id: i64,
    on_event: Channel<DiarizationEvent>,
    state: Arc<Mutex<DiarizationState>>,
) -> Result<(), String> {
    {
        let mut guard = state
            .lock()
            .map_err(|_| "diarization state lock poisoned".to_string())?;

        if let Some(active_meeting_id) = guard.running_meeting_id {
            return Err(format!("diarization is already running for meeting {active_meeting_id}"));
        }

        guard.running_meeting_id = Some(meeting_id);
    }

    let state_for_thread = state.clone();
    std::thread::Builder::new()
        .name(format!("diarization-{meeting_id}"))
        .spawn(move || {
            let result = worker::run_worker(pool, data_dir, meeting_id, on_event);
            if let Ok(mut guard) = state_for_thread.lock() {
                guard.running_meeting_id = None;
            }

            if let Err(err) = result {
                eprintln!("[diarization] worker failed for meeting {meeting_id}: {err}");
            }
        })
        .map_err(|err| format!("failed to spawn diarization worker thread: {err}"))?;

    Ok(())
}
