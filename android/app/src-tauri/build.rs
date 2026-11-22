fn main() {
    // Generates allow-* permissions for the app's own commands (used in capabilities/default.json).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "auth_settings",
            "auth_restore",
            "auth_scopes",
            "auth_client_id",
            "auth_login",
            "auth_logout",
            "spotify_api",
        ]),
    ))
    .expect("failed to run tauri-build");
}
