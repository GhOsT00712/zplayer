//! Spotify sign-in and Web API access for ZPLAYER on Android (A4).
//!
//! Shares the Spotify OAuth primitives with Windows. What differs on Android:
//! - Spotify sends the browser back to `io.zplayer.android://callback`, which Android opens in this
//!   app (Tauri's deep-link plugin); `deep_link` below hands the code to the waiting sign-in.
//! - The refresh token is kept in the app's private storage (only this app can read it), instead of
//!   the Windows Credential Manager. Moving it to the Android Keystore is a later hardening step.
//! - No `streaming` scope: playback goes through the Spotify app (App Remote), not the web player.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use zplayer_spotify_auth::{new_pkce_parameters, pkce_challenge, TOKEN_ENDPOINT};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{oneshot, Mutex};
use url::Url;

pub const REDIRECT: &str = "io.zplayer.android://callback";
const SCOPES: &str = concat!(
    "app-remote-control user-read-email user-read-private user-read-playback-state ",
    "user-modify-playback-state user-read-currently-playing playlist-read-private ",
    "playlist-read-collaborative user-library-read user-follow-read user-read-recently-played user-top-read"
);
/// Optional: build with SPOTIFY_CLIENT_ID set to fill in the Client ID on the sign-in screen.
const BUILT_IN_CLIENT_ID: Option<&str> = option_env!("SPOTIFY_CLIENT_ID");

#[derive(Debug, Serialize)]
pub struct Failure {
    status: Option<u16>,
    message: String,
    endpoint: Option<String>,
    reauthenticate: bool,
}

impl Failure {
    fn local(message: impl Into<String>) -> Self {
        Self { status: None, message: message.into(), endpoint: None, reauthenticate: false }
    }

    fn request(endpoint: &str, status: Option<u16>, message: impl Into<String>) -> Self {
        Self { status, message: message.into(), endpoint: Some(endpoint.into()), reauthenticate: false }
    }
}

#[derive(Deserialize, Serialize)]
struct Credential {
    client_id: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
}

struct AccessToken {
    value: String,
    usable_until: Instant,
}

#[derive(Default)]
struct Session {
    credential: Option<Credential>,
    access: Option<AccessToken>,
}

/// A sign-in waiting for the browser to come back.
struct Pending {
    state: String,
    reply: oneshot::Sender<Result<String, Failure>>,
}

pub struct Auth {
    client: Client,
    session: Mutex<Session>,
    login: Mutex<()>,
    pending: std::sync::Mutex<Option<Pending>>,
    store: std::sync::Mutex<Option<PathBuf>>,
}

impl Auth {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Could not initialize HTTPS client");
        Self {
            client,
            session: Mutex::default(),
            login: Mutex::default(),
            pending: std::sync::Mutex::new(None),
            store: std::sync::Mutex::new(None),
        }
    }

    /// Where the sign-in is kept: a file in the app's private data folder.
    pub fn set_store(&self, app: &AppHandle) {
        if let Ok(dir) = app.path().app_data_dir() {
            *self.store.lock().unwrap() = Some(dir.join("spotify-sign-in.json"));
        }
    }

    fn store_path(&self) -> Result<PathBuf, Failure> {
        self.store.lock().unwrap().clone().ok_or_else(|| Failure::local("The app's storage isn't available."))
    }

    fn read_credential(&self) -> Result<Option<Credential>, Failure> {
        match std::fs::read_to_string(self.store_path()?) {
            Ok(text) => serde_json::from_str(&text).map(Some).map_err(|_| {
                Failure::local("The saved sign-in is unreadable. Sign out in Settings and connect again.")
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(Failure::local(format!("Could not read the saved sign-in: {error}"))),
        }
    }

    fn save_credential(&self, credential: &Credential) -> Result<(), Failure> {
        let path = self.store_path()?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| Failure::local(format!("Could not save the sign-in: {e}")))?;
        }
        let text = serde_json::to_string(credential).map_err(|_| Failure::local("Could not encode the sign-in."))?;
        // write next to it, then swap in, so a crash never leaves half a file
        let partial = path.with_extension("json.part");
        std::fs::write(&partial, text)
            .and_then(|()| std::fs::rename(&partial, &path))
            .map_err(|e| Failure::local(format!("Could not save the sign-in: {e}")))
    }

    fn delete_credential(&self) -> Result<(), Failure> {
        match std::fs::remove_file(self.store_path()?) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(Failure::local(format!("Could not clear the saved sign-in: {error}"))),
        }
    }

    async fn access(&self, rejected: Option<&str>) -> Result<Option<String>, Failure> {
        let mut session = self.session.lock().await;
        if let Some(access) = &session.access {
            if Instant::now() < access.usable_until && rejected != Some(access.value.as_str()) {
                return Ok(Some(access.value.clone()));
            }
        }
        if session.credential.is_none() {
            session.credential = self.read_credential()?;
        }
        let Some(credential) = &session.credential else { return Ok(None) };

        let response = self
            .token_request(&[
                ("grant_type", "refresh_token"),
                ("client_id", &credential.client_id),
                ("refresh_token", &credential.refresh_token),
            ])
            .await;
        let response = match response {
            Ok(response) => response,
            Err(error) if error.message == "invalid_grant" => {
                self.delete_credential()?;
                *session = Session::default();
                return Err(Failure {
                    reauthenticate: true,
                    ..Failure::request(
                        TOKEN_ENDPOINT,
                        error.status,
                        "Your Spotify session expired or was revoked. Connect again.",
                    )
                });
            }
            Err(error) => return Err(error),
        };
        let credential = Credential {
            client_id: credential.client_id.clone(),
            refresh_token: select_refresh_token(response.refresh_token.as_deref(), Some(&credential.refresh_token))?,
        };
        let rotated = session.credential.as_ref().is_some_and(|previous| previous.refresh_token != credential.refresh_token);
        let access = response.access_token.clone();
        let persist = if rotated { self.save_credential(&credential) } else { Ok(()) };
        // Keep the replacement in memory even if saving failed during rotation.
        *session = Session { credential: Some(credential), access: Some(cached(response)) };
        persist?;
        Ok(Some(access))
    }

    async fn token_request(&self, form: &[(&str, &str)]) -> Result<TokenResponse, Failure> {
        let response = self
            .client
            .post(TOKEN_ENDPOINT)
            .form(form)
            .send()
            .await
            .map_err(|e| Failure::request(TOKEN_ENDPOINT, None, network_message(&e)))?;
        let status = response.status();
        if !status.is_success() {
            let body: Value = response.json().await.unwrap_or_default();
            let code = body.get("error").and_then(Value::as_str).unwrap_or("Token request failed");
            return Err(Failure::request(TOKEN_ENDPOINT, Some(status.as_u16()), code));
        }
        response
            .json()
            .await
            .map_err(|_| Failure::request(TOKEN_ENDPOINT, Some(status.as_u16()), "Invalid token response"))
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

fn cached(response: TokenResponse) -> AccessToken {
    AccessToken {
        value: response.access_token,
        usable_until: Instant::now() + Duration::from_secs(response.expires_in.saturating_sub(60)),
    }
}

fn select_refresh_token(new: Option<&str>, previous: Option<&str>) -> Result<String, Failure> {
    zplayer_spotify_auth::select_refresh_token(new, previous)
        .ok_or_else(|| Failure::request(TOKEN_ENDPOINT, None, "Spotify returned no refresh token."))
}

/// A Web API request. Spotify answers 411 Length Required to a PUT, POST or DELETE that has no
/// Content-Length (pause, next, seek, shuffle, repeat…), and the HTTP client leaves the header out
/// for an empty body, so it's set here explicitly.
fn api_request(client: &Client, verb: Method, url: Url, token: &str, body: Option<&Value>) -> reqwest::RequestBuilder {
    let request = client.request(verb.clone(), url).bearer_auth(token);
    match body {
        Some(body) => request.json(body),
        None if verb != Method::GET => request.header(reqwest::header::CONTENT_LENGTH, "0").body(Vec::<u8>::new()),
        None => request,
    }
}

fn network_message(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() { "Request timed out" } else { "Network request failed" }
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
pub async fn auth_restore(auth: State<'_, Auth>) -> Result<bool, Failure> {
    Ok(auth.access(None).await?.is_some())
}

/// The Client ID of the saved sign-in (App Remote needs it to connect to the Spotify app).
#[tauri::command]
pub async fn auth_client_id(auth: State<'_, Auth>) -> Result<Option<String>, Failure> {
    let mut session = auth.session.lock().await;
    if session.credential.is_none() {
        session.credential = auth.read_credential()?;
    }
    Ok(session.credential.as_ref().map(|c| c.client_id.clone()))
}

#[tauri::command]
pub async fn auth_login(app: AppHandle, auth: State<'_, Auth>, client_id: String) -> Result<(), Failure> {
    let _attempt = auth.login.try_lock().map_err(|_| Failure::local("A sign-in attempt is already open."))?;
    let client_id = client_id.trim().to_owned();
    if client_id.len() != 32 || !client_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Failure::local("Enter the 32-character Client ID from your Spotify app."));
    }

    let (verifier, state) = new_pkce_parameters();
    let (reply, code) = oneshot::channel();
    *auth.pending.lock().unwrap() = Some(Pending { state: state.clone(), reply });

    let mut url = Url::parse("https://accounts.spotify.com/authorize").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id.as_str()),
        ("response_type", "code"),
        ("redirect_uri", REDIRECT),
        ("code_challenge_method", "S256"),
        ("code_challenge", &pkce_challenge(&verifier)),
        ("state", &state),
        ("scope", SCOPES),
    ]);
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| Failure::local("Could not open the browser."))?;

    let code = match tokio::time::timeout(Duration::from_secs(300), code).await {
        Ok(Ok(result)) => result?,
        Ok(Err(_)) => return Err(Failure::local("The sign-in was interrupted. Try connect again.")),
        Err(_) => {
            auth.pending.lock().unwrap().take();
            return Err(Failure::local("Sign-in timed out after five minutes. Try connect again."));
        }
    };

    let response = auth
        .token_request(&[
            ("grant_type", "authorization_code"),
            ("client_id", &client_id),
            ("code", &code),
            ("redirect_uri", REDIRECT),
            ("code_verifier", &verifier),
        ])
        .await?;
    let credential = Credential { client_id, refresh_token: select_refresh_token(response.refresh_token.as_deref(), None)? };
    let mut session = auth.session.lock().await;
    auth.save_credential(&credential)?;
    *session = Session { credential: Some(credential), access: Some(cached(response)) };
    Ok(())
}

#[tauri::command]
pub async fn auth_logout(auth: State<'_, Auth>) -> Result<(), Failure> {
    let _attempt = auth.login.try_lock().map_err(|_| Failure::local("Finish the open sign-in first."))?;
    let mut session = auth.session.lock().await;
    auth.delete_credential()?;
    *session = Session::default();
    Ok(())
}

#[tauri::command]
pub async fn spotify_api(auth: State<'_, Auth>, path: String, method: String, body: Option<Value>) -> Result<Value, Failure> {
    let verb = match method.as_str() {
        "GET" => Method::GET,
        "PUT" => Method::PUT,
        "POST" => Method::POST,
        "DELETE" => Method::DELETE,
        _ => return Err(Failure::local("Unsupported API method.")),
    };
    let url = Url::parse(&format!("https://api.spotify.com/v1{path}"))
        .ok()
        .filter(|u| path.starts_with('/') && u.path().starts_with("/v1/") && u.fragment().is_none())
        .ok_or_else(|| Failure::local("Invalid Spotify API path."))?;
    let endpoint = format!("{method} {}", url.path());
    let send = |token: &str| api_request(&auth.client, verb.clone(), url.clone(), token, body.as_ref()).send();
    let token = auth.access(None).await?.ok_or_else(|| Failure::local("Connect your Spotify account first."))?;
    let send_error = |e: reqwest::Error| Failure::request(&endpoint, None, network_message(&e));
    let mut response = send(&token).await.map_err(send_error)?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let refreshed = auth.access(Some(&token)).await?.ok_or_else(|| Failure::local("Connect your Spotify account again."))?;
        response = send(&refreshed).await.map_err(send_error)?;
    }
    let status = response.status();
    if status == reqwest::StatusCode::NO_CONTENT {
        return Ok(Value::Null);
    }
    if !status.is_success() {
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let json: Value = response.json().await.unwrap_or_default();
        let mut message = json
            .pointer("/error/message")
            .and_then(Value::as_str)
            .or_else(|| status.canonical_reason())
            .unwrap_or("Spotify API request failed")
            .to_owned();
        if let Some(seconds) = retry_after {
            message.push_str(&format!(" (retry after {seconds}s)"));
        }
        return Err(Failure::request(&endpoint, Some(status.as_u16()), message));
    }
    let text = response.text().await.map_err(|_| Failure::request(&endpoint, Some(status.as_u16()), "Invalid response"))?;
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    match serde_json::from_str(&text) {
        Ok(value) => Ok(value),
        // Player commands (play, seek, next, shuffle…) succeed with a body that isn't JSON:
        // the command worked, so report success with no data.
        Err(_) if verb != Method::GET => Ok(Value::Null),
        Err(_) => Err(Failure::request(&endpoint, Some(status.as_u16()), "Invalid JSON response")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_rfc7636_example() {
        assert_eq!(pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn refresh_keeps_previous_token_when_omitted() {
        assert_eq!(select_refresh_token(None, Some("old")).unwrap(), "old");
        assert_eq!(select_refresh_token(Some(""), Some("old")).unwrap(), "old");
        assert_eq!(select_refresh_token(Some("new"), Some("old")).unwrap(), "new");
        assert!(select_refresh_token(None, None).is_err());
    }

    /// Sends a request to a local socket and returns the raw request head it received.
    fn received_head(verb: Method, body: Option<&Value>) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = Url::parse(&format!("http://{}/v1/me/player/pause", listener.local_addr().unwrap())).unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 4096];
            let read = socket.read(&mut buffer).unwrap();
            let _ = socket.write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n");
            String::from_utf8_lossy(&buffer[..read]).to_lowercase()
        });
        let client = Client::new();
        let request = api_request(&client, verb, url, "token", body);
        let _ = tauri::async_runtime::block_on(request.send());
        server.join().unwrap()
    }

    #[test]
    fn bodiless_commands_send_content_length_zero() {
        assert!(received_head(Method::PUT, None).contains("content-length: 0"), "PUT");
        assert!(received_head(Method::POST, None).contains("content-length: 0"), "POST");
        assert!(received_head(Method::DELETE, None).contains("content-length: 0"), "DELETE");
        assert!(!received_head(Method::GET, None).contains("content-length"), "GET has no body");
        let json = received_head(Method::PUT, Some(&serde_json::json!({ "uris": ["spotify:track:x"] })));
        assert!(json.contains("content-type: application/json") && !json.contains("content-length: 0"), "JSON body");
    }

    #[test]
    fn callback_with_wrong_state_is_ignored() {
        let auth = Auth::new();
        let (reply, mut code) = oneshot::channel();
        *auth.pending.lock().unwrap() = Some(Pending { state: "good".into(), reply });
        auth.deep_link(&Url::parse("io.zplayer.android://callback?code=abc&state=bad").unwrap());
        assert!(code.try_recv().is_err());
        auth.deep_link(&Url::parse("io.zplayer.android://callback?code=abc&state=good").unwrap());
        assert_eq!(code.try_recv().unwrap().unwrap(), "abc");
    }
}
