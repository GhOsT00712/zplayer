//! ZPLAYER for Android: a Tauri v2 shell around the phone UI in ../../frontend.
//! Full screen, the back gesture, insets and the lock screen live in MainActivity.kt and
//! frontend/src/platform/android.ts. Spotify sign-in and the Web API are in auth.rs (A4).

mod auth;

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(auth::Auth::new())
        .invoke_handler(tauri::generate_handler![
            auth::auth_settings,
            auth::auth_restore,
            auth::auth_client_id,
            auth::auth_login,
            auth::auth_logout,
            auth::spotify_api,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            app.state::<auth::Auth>().set_store(&handle);
            // Spotify's sign-in page sends the browser to io.zplayer.android://callback, which
            // Android opens in this app; pass it to the waiting sign-in.
            let links = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    links.state::<auth::Auth>().deep_link(&url);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not run ZPLAYER");
}
