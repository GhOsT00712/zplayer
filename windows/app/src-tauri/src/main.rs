#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod origin;

use auth::{
    auth_login, auth_logout, auth_restore, auth_scopes, auth_settings, spotify_api, spotify_open_source,
    spotify_sdk_token,
};
use origin::{allow_navigation, loopback_bootstrap};
use tauri::{webview::NewWindowResponse, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(auth::new_auth())
        .manage(origin::FrontendServer::default())
        .invoke_handler(tauri::generate_handler![
            auth_settings,
            auth_restore,
            auth_scopes,
            auth_login,
            auth_logout,
            spotify_sdk_token,
            spotify_api,
            spotify_open_source,
            loopback_bootstrap
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("ZPLAYER")
                .inner_size(1280.0, 800.0)
                .min_inner_size(640.0, 520.0)
                // No Windows title bar: the app draws its own minimize / maximize / close buttons
                // and the top bars drag the window (see WindowControls in src/theme/Controls.tsx).
                .decorations(false)
                .shadow(true)
                .on_navigation(allow_navigation)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Could not run ZPLAYER");
}
