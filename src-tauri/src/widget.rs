use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn show_widget(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("recording-widget").is_some() {
        return Ok(());
    }

    let widget = WebviewWindowBuilder::new(
        app,
        "recording-widget",
        WebviewUrl::App("index.html#/widget".into()),
    )
    .title("")
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .inner_size(340.0, 86.0)
    .skip_taskbar(true)
    .build()?;

    if let Ok(Some(monitor)) = widget.primary_monitor() {
        let screen_size = monitor.size();
        let scale = monitor.scale_factor();
        let x = (screen_size.width as f64 / scale / 2.0) - 170.0;
        let y = 24.0;
        widget.set_position(LogicalPosition::new(x, y))?;
    }

    Ok(())
}

pub fn hide_widget(app: &AppHandle) {
    if let Some(widget) = app.get_webview_window("recording-widget") {
        let _ = widget.close();
    }
}
