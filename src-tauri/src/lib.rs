mod audio;
mod commands;
mod db;
mod download;
mod llm;
mod session;
mod transcription;
mod tray;
mod widget;

use commands::{RecordingStateHandle, SessionHandle, TranscriptionStateHandle};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

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
            let home = std::env::var("HOME").expect("HOME not set");
            let data_dir = std::path::PathBuf::from(&home).join(".opennotes");
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

            #[cfg(desktop)]
            {
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
                .add_migrations("sqlite:~/.opennotes/data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
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
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["cmdorcontrol+shift+r"])
                .expect("Failed to register shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("recording-toggle", ());
                    }
                })
                .build(),
        );
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
