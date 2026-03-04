use tauri::{
    menu::MenuEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Manager,
};

pub struct TrayMenuHandles {
    pub start_stop: MenuItem<tauri::Wry>,
}

pub fn create_tray(app: &App) -> tauri::Result<()> {
    let start_stop = MenuItem::with_id(app, "start-stop", "Start Recording", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show openNotes", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    app.manage(TrayMenuHandles {
        start_stop: start_stop.clone(),
    });

    let menu = Menu::with_items(app, &[&start_stop, &show, &quit])?;

    let default_icon = app
        .default_window_icon()
        .expect("default window icon should exist")
        .clone();

    TrayIconBuilder::with_id("main")
        .icon(default_icon)
        .tooltip("openNotes")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "start-stop" => {
                let _ = app.emit("recording-toggle", ());
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
