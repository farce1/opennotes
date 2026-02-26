use tauri::AppHandle;

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
