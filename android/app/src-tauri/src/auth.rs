//! Spotify sign-in for ZPLAYER on Android. Token refresh, the API proxy, scopes and errors live in
//! `zplayer-spotify-auth`; this file keeps what is Android-only:
//! - Spotify sends the browser back to `io.zplayer.android://callback`, which Android opens in this
//!   app (Tauri's deep-link plugin); `deep_link` hands the code to the waiting sign-in.
//! - The refresh token is kept in the app's private storage (only this app can read it), instead of
//!   the Windows Credential Manager. Moving it to the Android Keystore is a later hardening step.
//! - No `streaming` scope: playback goes through the Spotify app (App Remote), not the web player.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;
use url::Url;
use zplayer_spotify_auth::scopes::{scope_string, ANDROID_EXTRA};
use zplayer_spotify_auth::{
    new_pkce_parameters, pkce_challenge, Auth, Credential, CredentialStore, Failure,
};

pub const REDIRECT: &str = "io.zplayer.android://callback";
/// Optional: build with SPOTIFY_CLIENT_ID set to fill in the Client ID on the sign-in screen.
const BUILT_IN_CLIENT_ID: Option<&str> = option_env!("SPOTIFY_CLIENT_ID");

/// The sign-in kept as a file in the app's private data folder.
#[derive(Default)]
struct FileStore {
    path: std::sync::Mutex<Option<PathBuf>>,
}

impl FileStore {
    fn path(&self) -> Result<PathBuf, Failure> {
        self.path
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| Failure::local("The app's storage isn't available."))
    }
}

impl CredentialStore for FileStore {
    fn read(&self) -> Result<Option<Credential>, Failure> {
        match std::fs::read_to_string(self.path()?) {
            Ok(text) => serde_json::from_str(&text).map(Some).map_err(|_| {
                Failure::local("The saved sign-in is unreadable. Sign out in Settings and connect again.")
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(Failure::local(format!("Could not read the saved sign-in: {error}"))),
        }
    }

    fn save(&self, credential: &Credential) -> Result<(), Failure> {
        let path = self.path()?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|e| Failure::local(format!("Could not save the sign-in: {e}")))?;
        }
        let text = serde_json::to_string(credential)
            .map_err(|_| Failure::local("Could not encode the sign-in."))?;
        // write next to it, then swap in, so a crash never leaves half a file
        let partial = path.with_extension("json.part");
        std::fs::write(&partial, text)
            .and_then(|()| std::fs::rename(&partial, &path))
            .map_err(|e| Failure::local(format!("Could not save the sign-in: {e}")))
    }

    fn delete(&self) -> Result<(), Failure> {
        match std::fs::remove_file(self.path()?) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(Failure::local(format!("Could not clear the saved sign-in: {error}"))),
        }
    }
}

/// A sign-in waiting for the browser to come back.
struct Pending {
    state: String,
    reply: oneshot::Sender<Result<String, Failure>>,
}

/// Shared Spotify session plus the Android redirect and storage glue.
pub struct Android {
    auth: Auth,
    store: Arc<FileStore>,
    pending: std::sync::Mutex<Option<Pending>>,
}

impl Android {
    pub fn new() -> Self {
        let store = Arc::new(FileStore::default());
        Self { auth: Auth::new(store.clone()), store, pending: std::sync::Mutex::new(None) }
    }

    pub fn set_store(&self, app: &AppHandle) {
        if let Ok(dir) = app.path().app_data_dir() {
            *self.store.path.lock().unwrap() = Some(dir.join("spotify-sign-in.json"));
        }
    }

    /// Called when Android opens `io.zplayer.android://callback?...` in this app.
    pub fn deep_link(&self, url: &Url) {
        if url.scheme() != "io.zplayer.android" || url.host_str() != Some("callback") {
            return;
        }
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        let mut pending = self.pending.lock().unwrap();
        let Some(waiting) = pending.take_if(|p| pairs.get("state") == Some(&p.state)) else { return };
        let result = match pairs.get("code").filter(|code| !code.is_empty() && !pairs.contains_key("error")) {
            Some(code) => Ok(code.clone()),
            None => Err(Failure::local(match pairs.get("error").map(String::as_str) {
                Some("access_denied") => "Sign-in was cancelled in Spotify. Try connect again.",
                _ => "Spotify couldn't complete the sign-in. Try connect again.",
            })),
        };
        let _ = waiting.reply.send(result);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    client_id: String,
    redirect_uri: &'static str,
}

#[tauri::command]
pub fn auth_settings() -> Settings {
    Settings { client_id: BUILT_IN_CLIENT_ID.unwrap_or_default().to_owned(), redirect_uri: REDIRECT }
}

#[tauri::command]
pub async fn auth_restore(app: State<'_, Android>) -> Result<bool, Failure> {
    Ok(app.auth.access(None).await?.is_some())
}

/// Scopes Spotify granted to the saved sign-in, so the frontend can ask to reconnect when one is missing.
#[tauri::command]
pub async fn auth_scopes(app: State<'_, Android>) -> Result<Vec<String>, Failure> {
    app.auth.granted_scopes().await
}

/// The Client ID of the saved sign-in (App Remote needs it to connect to the Spotify app).
#[tauri::command]
pub async fn auth_client_id(app: State<'_, Android>) -> Result<Option<String>, Failure> {
    app.auth.client_id().await
}

#[tauri::command]
pub async fn auth_login(
    handle: AppHandle,
    app: State<'_, Android>,
    client_id: String,
) -> Result<(), Failure> {
    let _attempt = app.auth.try_login_guard("A sign-in attempt is already open.")?;
    let client_id = client_id.trim().to_owned();
    if client_id.len() != 32 || !client_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Failure::local("Enter the 32-character Client ID from your Spotify app."));
    }

    let (verifier, state) = new_pkce_parameters();
    let (reply, code) = oneshot::channel();
    *app.pending.lock().unwrap() = Some(Pending { state: state.clone(), reply });

    let mut url = Url::parse("https://accounts.spotify.com/authorize").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id.as_str()),
        ("response_type", "code"),
        ("redirect_uri", REDIRECT),
        ("code_challenge_method", "S256"),
        ("code_challenge", &pkce_challenge(&verifier)),
        ("state", &state),
        ("scope", &scope_string(ANDROID_EXTRA)),
    ]);
    handle
        .opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| Failure::local("Could not open the browser."))?;

    let code = match tokio::time::timeout(Duration::from_secs(300), code).await {
        Ok(Ok(result)) => result?,
        Ok(Err(_)) => return Err(Failure::local("The sign-in was interrupted. Try connect again.")),
        Err(_) => {
            app.pending.lock().unwrap().take();
            return Err(Failure::local("Sign-in timed out after five minutes. Try connect again."));
        }
    };
    app.auth.complete_login(client_id, &code, REDIRECT, &verifier).await
}

#[tauri::command]
pub async fn auth_logout(app: State<'_, Android>) -> Result<(), Failure> {
    let _attempt = app.auth.try_login_guard("Finish the open sign-in first.")?;
    app.auth.logout().await
}

#[tauri::command]
pub async fn spotify_api(
    app: State<'_, Android>,
    path: String,
    method: String,
    body: Option<Value>,
) -> Result<Value, Failure> {
    app.auth.api(&path, &method, body).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_with_wrong_state_is_ignored() {
        let app = Android::new();
        let (reply, mut code) = oneshot::channel();
        *app.pending.lock().unwrap() = Some(Pending { state: "good".into(), reply });
        app.deep_link(&Url::parse("io.zplayer.android://callback?code=abc&state=bad").unwrap());
        assert!(code.try_recv().is_err());
        app.deep_link(&Url::parse("io.zplayer.android://callback?code=abc&state=good").unwrap());
        assert_eq!(code.try_recv().unwrap().unwrap(), "abc");
    }
}
