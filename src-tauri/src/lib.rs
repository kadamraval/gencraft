#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Lets the app read official model and pricing pages that do not allow browser requests
    .plugin(tauri_plugin_http::init())
    // Opens sign-in pages (Pinterest through Composio) in the system browser
    .plugin(tauri_plugin_opener::init())
    // Lets the person choose a folder for backups and saved results, and writes files into it
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // Remembers the folder the person chose, so it still works after the app restarts
    .plugin(tauri_plugin_persisted_scope::init())
    // Restarts the app after an update has been installed
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      // Looks for a newer version of the app and installs it (desktop only)
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
