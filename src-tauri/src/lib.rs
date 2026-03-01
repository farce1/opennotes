mod audio;
mod commands;
mod db;
mod download;
mod llm;
mod session;
mod transcription;
mod tray;
mod widget;

use std::path::{Path, PathBuf};

use commands::{RecordingStateHandle, SessionHandle, TranscriptionStateHandle};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Clone)]
pub struct DataDir(pub PathBuf);

fn normalize_shortcut_for_tauri(shortcut: &str) -> String {
    shortcut
        .to_lowercase()
        .replace("commandorcontrol", "cmdorcontrol")
}

fn read_shortcut_from_settings(data_dir: &Path) -> Option<String> {
    let store_path = data_dir.join("settings.json");
    let contents = std::fs::read_to_string(store_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).ok()?;

    parsed
        .get("recordingShortcut")
        .and_then(|value| value.as_str())
        .map(normalize_shortcut_for_tauri)
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn migrate_legacy_data_dir(data_dir: &Path) {
    let Ok(home) = std::env::var("HOME") else {
        return;
    };

    let legacy_dir = PathBuf::from(home).join(".opennotes");
    let migrated_marker = data_dir.join(".migrated");
    if !legacy_dir.exists() || migrated_marker.exists() {
        return;
    }

    if let Err(err) = std::fs::create_dir_all(data_dir) {
        eprintln!("[startup] failed to prepare data dir for migration: {err}");
        return;
    }

    if let Err(err) = copy_dir_recursive(&legacy_dir, data_dir) {
        eprintln!("[startup] failed to migrate legacy data from {}: {err}", legacy_dir.display());
        return;
    }

    if let Err(err) = std::fs::write(migrated_marker, "migrated") {
        eprintln!("[startup] failed to write migration marker: {err}");
    }
}

#[cfg(not(target_os = "macos"))]
fn migrate_legacy_data_dir(_data_dir: &Path) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "phase4_session",
            sql: include_str!("../migrations/002_phase4_session.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "phase6_library",
            sql: include_str!("../migrations/003_phase6_library.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let recording_state: RecordingStateHandle =
        std::sync::Arc::new(std::sync::Mutex::new(audio::RecordingState::default()));
    let transcription_state: TranscriptionStateHandle =
        std::sync::Arc::new(std::sync::Mutex::new(transcription::TranscriptionState::default()));

    let mut builder = tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .expect("failed to resolve app local data dir");

            migrate_legacy_data_dir(data_dir.as_path());
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
            std::fs::create_dir_all(data_dir.join("models")).ok();
            std::fs::create_dir_all(data_dir.join("logs")).ok();
            std::fs::create_dir_all(data_dir.join("recordings")).ok();

            let db_path = data_dir.join("data.db");
            let db_url = format!("sqlite:{}", db_path.display());

            let pool = tauri::async_runtime::block_on(crate::db::init_pool(&db_url))
                .expect("Failed to initialize database pool");

            let session_coordinator: SessionHandle = std::sync::Arc::new(std::sync::Mutex::new(
                crate::session::SessionCoordinator::new(),
            ));

            app.manage(DataDir(data_dir.clone()));
            app.manage(pool.clone());
            app.manage(session_coordinator);

            let pool_for_recovery = pool.clone();
            let app_handle_for_recovery = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) =
                    crate::session::recover_incomplete_sessions(&pool_for_recovery, &app_handle_for_recovery).await
                {
                    eprintln!("[startup] session recovery failed: {err}");
                }
            });

            let pool_for_fts = pool.clone();
            tauri::async_runtime::spawn(async move {
                let missing_ids = sqlx::query_scalar::<_, i64>(
                    "SELECT m.id
                     FROM meetings m
                     WHERE m.deleted_at IS NULL
                       AND NOT EXISTS (SELECT 1 FROM meetings_fts WHERE rowid = m.id)",
                )
                .fetch_all(&pool_for_fts)
                .await
                .unwrap_or_default();

                for id in &missing_ids {
                    if let Err(err) = crate::commands::fts_upsert(&pool_for_fts, *id).await {
                        eprintln!("[fts] backfill failed for meeting {id}: {err}");
                    }
                }

                if !missing_ids.is_empty() {
                    eprintln!("[fts] backfilled {} meetings", missing_ids.len());
                }
            });

            #[cfg(desktop)]
            {
                let startup_shortcut = read_shortcut_from_settings(data_dir.as_path())
                    .unwrap_or_else(|| "cmdorcontrol+shift+r".to_string());
                app.global_shortcut()
                    .on_shortcut(startup_shortcut.as_str(), |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = app.emit("recording-toggle", ());
                        }
                    })
                    .expect("failed to register startup shortcut");

                crate::tray::create_tray(app)?;

                if let Some(window) = app.get_webview_window("main") {
                    let window_clone = window.clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window_clone.hide();
                        }
                    });
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(recording_state)
        .manage(transcription_state)
        .invoke_handler(tauri::generate_handler![
            commands::update_tray_icon,
            commands::start_session,
            commands::stop_session,
            commands::pause_session,
            commands::resume_session,
            commands::get_session_state,
            commands::get_transcript_page,
            commands::retranscribe_meeting,
            commands::start_recording,
            commands::stop_recording,
            commands::pause_recording,
            commands::resume_recording,
            commands::start_transcription,
            commands::stop_transcription,
            commands::check_model_ready,
            commands::download_model,
            commands::list_audio_input_devices,
            commands::list_ollama_models,
            commands::delete_ollama_model,
            commands::update_recording_shortcut,
            commands::check_ollama_status,
            commands::pull_ollama_model,
            commands::generate_summary,
            commands::get_summary,
            commands::save_summary,
            commands::update_meeting_title,
            commands::soft_delete_meeting,
            commands::restore_meeting,
            commands::purge_old_trash,
            commands::backup_library,
            commands::restore_library,
            commands::check_audio_permissions,
            commands::update_tray_recording_state,
        ]);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_permissions::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
