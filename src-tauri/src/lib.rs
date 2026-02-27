mod audio;
mod commands;
mod tray;

use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    let mut builder = tauri::Builder::default()
        .setup(|app| {
            let home = std::env::var("HOME").expect("HOME not set");
            let data_dir = std::path::PathBuf::from(&home).join(".opennotes");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
            std::fs::create_dir_all(data_dir.join("models")).ok();
            std::fs::create_dir_all(data_dir.join("logs")).ok();
            std::fs::create_dir_all(data_dir.join("recordings")).ok();

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
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:~/.opennotes/data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![commands::update_tray_icon]);

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
