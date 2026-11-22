use std::time::{Duration, Instant};

use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use zplayer_spotify_auth::{new_pkce_parameters, pkce_challenge, TOKEN_ENDPOINT};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tiny_http::{Header, Response, Server};
use tokio::sync::Mutex;
use url::Url;

const REDIRECT: &str = "http://127.0.0.1:17654/callback";
const SCOPES: &str = concat!(
    "streaming user-read-email user-read-private user-read-playback-state ",
    "user-modify-playback-state user-read-currently-playing playlist-read-private ",
    "playlist-read-collaborative user-library-read user-read-recently-played user-top-read"
);

#[derive(Debug, Serialize)]
pub struct Failure {
    status: Option<u16>,
    message: String,
    endpoint: Option<String>,
    reauthenticate: bool,
}

impl Failure {
    fn local(message: impl Into<String>) -> Self {
        Self {
            status: None,
            message: message.into(),
            endpoint: None,
            reauthenticate: false,
        }
    }

    fn request(endpoint: &str, status: Option<u16>, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            endpoint: Some(endpoint.into()),
            reauthenticate: false,
        }
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

pub struct Auth {
    client: Client,
    session: Mutex<Session>,
    login: Mutex<()>,
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
            session.credential = tauri::async_runtime::spawn_blocking(read_credential)
                .await
                .map_err(|_| Failure::local("Credential lookup was interrupted."))??;
        }
        let Some(credential) = &session.credential else {
            return Ok(None);
        };

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
                tauri::async_runtime::spawn_blocking(delete_credential)
                    .await
                    .map_err(|_| Failure::local("Credential deletion was interrupted."))??;
                *session = Session::default();
                return Err(Failure {
                    reauthenticate: true,
                    ..Failure::request(
                        TOKEN_ENDPOINT,
                        error.status,
                        "Your Spotify session expired or was revoked. Connect again in Settings.",
                    )
                });
            }
            Err(error) => return Err(error),
        };
        let credential = Credential {
            client_id: credential.client_id.clone(),
            refresh_token: select_refresh_token(
                response.refresh_token.as_deref(),
                Some(&credential.refresh_token),
            )?,
        };
        let rotated = session
            .credential
            .as_ref()
            .is_some_and(|previous| previous.refresh_token != credential.refresh_token);
        let access = response.access_token.clone();
        let persist = if rotated {
            save_credential(&credential).await
        } else {
            Ok(())
        };
        // Keep the replacement in memory even if the OS store failed during rotation.
        *session = Session {
            credential: Some(credential),
            access: Some(cached(response)),
        };
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
            let code = body
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("Token request failed");
            return Err(Failure::request(
                TOKEN_ENDPOINT,
                Some(status.as_u16()),
                code,
            ));
        }
        response.json().await.map_err(|_| {
            Failure::request(
                TOKEN_ENDPOINT,
                Some(status.as_u16()),
                "Invalid token response",
            )
        })
    }
}

fn cached(response: TokenResponse) -> AccessToken {
    AccessToken {
        value: response.access_token,
        usable_until: Instant::now() + Duration::from_secs(response.expires_in.saturating_sub(60)),
    }
}

fn entry() -> Result<keyring::Entry, Failure> {
    keyring::Entry::new("io.zplayer.desktop", "spotify")
        .map_err(|e| Failure::local(format!("Could not open the OS credential store: {e}")))
}

fn read_credential() -> Result<Option<Credential>, Failure> {
    match entry()?.get_password() {
        Ok(value) => serde_json::from_str(&value).map(Some).map_err(|_| {
            Failure::local("Stored sign-in is unreadable. Sign out in Settings and connect again.")
        }),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(Failure::local(format!(
            "Could not read the OS credential store: {e}"
        ))),
    }
}

async fn save_credential(credential: &Credential) -> Result<(), Failure> {
    let value = serde_json::to_string(credential)
        .map_err(|_| Failure::local("Could not encode the sign-in."))?;
    tauri::async_runtime::spawn_blocking(move || {
        entry()?.set_password(&value).map_err(|e| {
            Failure::local(format!(
                "Could not save sign-in to the OS credential store: {e}"
            ))
        })
    })
    .await
    .map_err(|_| Failure::local("Saving the credential was interrupted."))?
}

fn delete_credential() -> Result<(), Failure> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(Failure::local(format!(
            "Could not clear sign-in from the OS credential store: {e}"
        ))),
    }
}

fn select_refresh_token(new: Option<&str>, previous: Option<&str>) -> Result<String, Failure> {
    zplayer_spotify_auth::select_refresh_token(new, previous)
        .ok_or_else(|| Failure::request(TOKEN_ENDPOINT, None, "Spotify returned no refresh token."))
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
    Err(Failure::local(
        "Sign-in timed out after three minutes. Try Connect again.",
    ))
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

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    auth: State<'_, Auth>,
    client_id: String,
) -> Result<(), Failure> {
    let _attempt = auth
        .login
        .try_lock()
        .map_err(|_| Failure::local("A sign-in attempt is already open."))?;
    let client_id = client_id.trim().to_owned();
    if client_id.len() != 32 || !client_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Failure::local(
            "Enter the 32-character Client ID from your Spotify app.",
        ));
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
        ("scope", SCOPES),
    ]);
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| Failure::local("Could not open the system browser."))?;
    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(server, &state))
        .await
        .map_err(|_| Failure::local("The browser callback was interrupted."))??;

    let response = auth
        .token_request(&[
            ("grant_type", "authorization_code"),
            ("client_id", &client_id),
            ("code", &code),
            ("redirect_uri", REDIRECT),
            ("code_verifier", &verifier),
        ])
        .await?;
    let credential = Credential {
        client_id,
        refresh_token: select_refresh_token(response.refresh_token.as_deref(), None)?,
    };
    let mut session = auth.session.lock().await;
    save_credential(&credential).await?;
    *session = Session {
        credential: Some(credential),
        access: Some(cached(response)),
    };
    Ok(())
}

#[tauri::command]
pub async fn auth_logout(auth: State<'_, Auth>) -> Result<(), Failure> {
    let _attempt = auth
        .login
        .try_lock()
        .map_err(|_| Failure::local("Finish the active sign-in attempt first."))?;
    let mut session = auth.session.lock().await;
    tauri::async_runtime::spawn_blocking(delete_credential)
        .await
        .map_err(|_| Failure::local("Credential deletion was interrupted."))??;
    *session = Session::default();
    Ok(())
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

fn network_message(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "Request timed out"
    } else {
        "Network request failed"
    }
}

#[tauri::command]
pub async fn spotify_api(
    auth: State<'_, Auth>,
    path: String,
    method: String,
    body: Option<Value>,
) -> Result<Value, Failure> {
    let verb = match method.as_str() {
        "GET" => Method::GET,
        "PUT" => Method::PUT,
        "POST" => Method::POST,
        _ => return Err(Failure::local("Unsupported API method.")),
    };
    let url = Url::parse(&format!("https://api.spotify.com/v1{path}"))
        .ok()
        .filter(|u| path.starts_with('/') && u.path().starts_with("/v1/") && u.fragment().is_none())
        .ok_or_else(|| Failure::local("Invalid Spotify API path."))?;
    let endpoint = format!("{method} {}", url.path());
    let send = |token: &str| {
        let mut request = auth
            .client
            .request(verb.clone(), url.clone())
            .bearer_auth(token);
        if let Some(body) = &body {
            request = request.json(body);
        }
        request.send()
    };
    let token = auth
        .access(None)
        .await?
        .ok_or_else(|| Failure::local("Connect your Spotify account first."))?;
    let send_error = |e: reqwest::Error| Failure::request(&endpoint, None, network_message(&e));
    let mut response = send(&token).await.map_err(send_error)?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let refreshed = auth
            .access(Some(&token))
            .await?
            .ok_or_else(|| Failure::local("Connect your Spotify account in Settings."))?;
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
    response
        .json()
        .await
        .map_err(|_| Failure::request(&endpoint, Some(status.as_u16()), "Invalid JSON response"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_rfc7636_example() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn refresh_preserves_previous_token_when_omitted() {
        assert_eq!(
            select_refresh_token(None, Some("previous")).unwrap(),
            "previous"
        );
        assert_eq!(
            select_refresh_token(Some(""), Some("previous")).unwrap(),
            "previous"
        );
    }

    #[test]
    fn refresh_replaces_rotated_token_and_rejects_missing_initial_token() {
        assert_eq!(
            select_refresh_token(Some("rotated"), Some("previous")).unwrap(),
            "rotated"
        );
        assert!(select_refresh_token(None, None).is_err());
    }
}
