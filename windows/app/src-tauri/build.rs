fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "auth_settings",
            "auth_restore",
            "auth_login",
            "auth_logout",
            "spotify_sdk_token",
            "spotify_api",
            "spotify_open_source",
            "loopback_bootstrap",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
