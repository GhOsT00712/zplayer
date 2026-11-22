//! Spotify sign-in for Windows. Token refresh, the API proxy, scopes and errors live in
//! `zplayer-spotify-auth`; this file keeps what is Windows-only: the loopback redirect, the
//! Credential Manager store and the Tauri command wrappers.

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tiny_http::{Header, Response, Server};
use url::Url;
use zplayer_spotify_auth::scopes::{scope_string, WINDOWS_EXTRA};
use zplayer_spotify_auth::{
    new_pkce_parameters, pkce_challenge, Credential, CredentialStore, Failure,
};

pub use zplayer_spotify_auth::Auth;

const REDIRECT: &str = "http://127.0.0.1:17654/callback";

struct KeyringStore;

fn entry() -> Result<keyring::Entry, Failure> {
    keyring::Entry::new("io.zplayer.desktop", "spotify")
        .map_err(|e| Failure::local(format!("Could not open the OS credential store: {e}")))
}

impl CredentialStore for KeyringStore {
    fn read(&self) -> Result<Option<Credential>, Failure> {
        match entry()?.get_password() {
            Ok(value) => serde_json::from_str(&value).map(Some).map_err(|_| {
                Failure::local("Stored sign-in is unreadable. Sign out in Settings and connect again.")
            }),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Failure::local(format!("Could not read the OS credential store: {e}"))),
        }
    }

    fn save(&self, credential: &Credential) -> Result<(), Failure> {
        let value = serde_json::to_string(credential)
            .map_err(|_| Failure::local("Could not encode the sign-in."))?;
        entry()?.set_password(&value).map_err(|e| {
            Failure::local(format!("Could not save sign-in to the OS credential store: {e}"))
        })
    }

    fn delete(&self) -> Result<(), Failure> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(Failure::local(format!(
                "Could not clear sign-in from the OS credential store: {e}"
            ))),
        }
    }
}

pub fn new_auth() -> Auth {
    Auth::new(Arc::new(KeyringStore))
}

fn wait_for_code(server: Server, expected_state: &str) -> Result<String, Failure> {
    let deadline = Instant::now() + Duration::from_secs(180);
    while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
        let request = server
            .recv_timeout(remaining)
            .map_err(|_| Failure::local("Could not receive the browser callback."))?;
        let Some(request) = request else { break };
        let host_ok = request
            .headers()
            .iter()
            .any(|h| h.field.equiv("Host") && h.value.as_str() == "127.0.0.1:17654");
        let parsed = Url::parse(&format!("http://127.0.0.1:17654{}", request.url())).ok();
        let Some(url) = parsed.filter(|u| {
            u.path() == "/callback" && host_ok && request.method() == &tiny_http::Method::Get
        }) else {
            let _ = request.respond(Response::empty(404));
            continue;
        };
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().collect();
        if pairs.get("state").map(|value| value.as_ref()) != Some(expected_state) {
            let _ = request
                .respond(Response::from_string("Invalid callback state.").with_status_code(400));
            continue;
        }
        let code = pairs
            .get("code")
            .filter(|value| !value.is_empty() && !pairs.contains_key("error"));
        let message = if code.is_some() {
            "Authorization received. Return to ZPLAYER to see the sign-in result."
        } else {
            "Authorization was declined or failed. Return to ZPLAYER to try again."
        };
        let _ = request.respond(
            Response::from_string(message)
                .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
                .with_header(Header::from_bytes("Referrer-Policy", "no-referrer").unwrap()),
        );
        return code
            .map(|value| value.to_string())
            .ok_or_else(|| Failure::local(message));
    }
    Err(Failure::local("Sign-in timed out after three minutes. Try Connect again."))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    client_id: String,
    redirect_uri: &'static str,
}

#[tauri::command]
pub fn auth_settings() -> Settings {
    Settings {
        client_id: std::env::var("SPOTIFY_CLIENT_ID").unwrap_or_default(),
        redirect_uri: REDIRECT,
    }
}

#[tauri::command]
pub async fn auth_restore(auth: State<'_, Auth>) -> Result<bool, Failure> {
    Ok(auth.access(None).await?.is_some())
}

/// Scopes Spotify granted to the saved sign-in, so the frontend can ask to reconnect when one is missing.
#[tauri::command]
pub async fn auth_scopes(auth: State<'_, Auth>) -> Result<Vec<String>, Failure> {
    auth.granted_scopes().await
}

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    auth: State<'_, Auth>,
    client_id: String,
) -> Result<(), Failure> {
    let _attempt = auth.try_login_guard("A sign-in attempt is already open.")?;
    let client_id = client_id.trim().to_owned();
    if client_id.len() != 32 || !client_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Failure::local("Enter the 32-character Client ID from your Spotify app."));
    }

    let server = Server::http("127.0.0.1:17654")
        .map_err(|e| Failure::local(format!("Could not listen on 127.0.0.1:17654: {e}")))?;
    let (verifier, state) = new_pkce_parameters();
    let mut url = Url::parse("https://accounts.spotify.com/authorize").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id.as_str()),
        ("response_type", "code"),
        ("redirect_uri", REDIRECT),
        ("code_challenge_method", "S256"),
        ("code_challenge", &pkce_challenge(&verifier)),
        ("state", &state),
        ("scope", &scope_string(WINDOWS_EXTRA)),
    ]);
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| Failure::local("Could not open the system browser."))?;
    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(server, &state))
        .await
        .map_err(|_| Failure::local("The browser callback was interrupted."))??;
    auth.complete_login(client_id, &code, REDIRECT, &verifier).await
}

#[tauri::command]
pub async fn auth_logout(auth: State<'_, Auth>) -> Result<(), Failure> {
    let _attempt = auth.try_login_guard("Finish the active sign-in attempt first.")?;
    auth.logout().await
}

#[tauri::command]
pub async fn spotify_sdk_token(auth: State<'_, Auth>) -> Result<String, Failure> {
    auth.access(None)
        .await?
        .ok_or_else(|| Failure::local("Connect your Spotify account first."))
}

#[tauri::command]
pub fn spotify_open_source(app: AppHandle, url: String) -> Result<(), Failure> {
    let url = Url::parse(&url)
        .ok()
        .filter(|url| {
            url.origin().ascii_serialization() == "https://open.spotify.com"
                && (url.path().starts_with("/track/") || url.path().starts_with("/playlist/"))
        })
        .ok_or_else(|| Failure::local("Unexpected source link."))?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| Failure::local("Could not open the Spotify link."))
}

#[tauri::command]
pub async fn spotify_api(
    auth: State<'_, Auth>,
    path: String,
    method: String,
    body: Option<Value>,
) -> Result<Value, Failure> {
    auth.api(&path, &method, body).await
}
