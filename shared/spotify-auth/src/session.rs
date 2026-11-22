use std::sync::Arc;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::{Mutex, MutexGuard};

use crate::{select_refresh_token, Credential, CredentialStore, Failure};

pub const TOKEN_ENDPOINT: &str = "https://accounts.spotify.com/api/token";

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    scope: Option<String>,
}

struct AccessToken {
    value: String,
    usable_until: Instant,
    scopes: Vec<String>,
}

#[derive(Default)]
struct Session {
    credential: Option<Credential>,
    access: Option<AccessToken>,
}

/// Token cache and refresh for one signed-in Spotify account.
pub struct Auth {
    pub(crate) client: Client,
    session: Mutex<Session>,
    login: Mutex<()>,
    store: Arc<dyn CredentialStore>,
}

fn cached(response: &TokenResponse) -> AccessToken {
    AccessToken {
        value: response.access_token.clone(),
        usable_until: Instant::now() + Duration::from_secs(response.expires_in.saturating_sub(60)),
        scopes: response
            .scope
            .as_deref()
            .unwrap_or_default()
            .split_whitespace()
            .map(str::to_owned)
            .collect(),
    }
}

pub(crate) fn network_message(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "Request timed out"
    } else {
        "Network request failed"
    }
}

fn no_refresh_token() -> Failure {
    Failure::request(TOKEN_ENDPOINT, None, "Spotify returned no refresh token.")
}

impl Auth {
    pub fn new(store: Arc<dyn CredentialStore>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Could not initialize HTTPS client");
        Self { client, session: Mutex::default(), login: Mutex::default(), store }
    }

    async fn blocking<T: Send + 'static>(
        &self,
        work: impl FnOnce(Arc<dyn CredentialStore>) -> Result<T, Failure> + Send + 'static,
    ) -> Result<T, Failure> {
        let store = self.store.clone();
        tokio::task::spawn_blocking(move || work(store))
            .await
            .map_err(|_| Failure::local("The credential store call was interrupted."))?
    }

    /// Only one sign-in or sign-out at a time; `busy` is the message when one is already open.
    pub fn try_login_guard(&self, busy: &str) -> Result<MutexGuard<'_, ()>, Failure> {
        self.login.try_lock().map_err(|_| Failure::local(busy))
    }

    /// A valid access token, refreshing when it is near expiry or `rejected` by the API.
    pub async fn access(&self, rejected: Option<&str>) -> Result<Option<String>, Failure> {
        let mut session = self.session.lock().await;
        if let Some(access) = &session.access {
            if Instant::now() < access.usable_until && rejected != Some(access.value.as_str()) {
                return Ok(Some(access.value.clone()));
            }
        }
        if session.credential.is_none() {
            session.credential = self.blocking(|store| store.read()).await?;
        }
        let Some(credential) = session.credential.clone() else {
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
                self.blocking(|store| store.delete()).await?;
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
        let updated = Credential {
            client_id: credential.client_id.clone(),
            refresh_token: select_refresh_token(
                response.refresh_token.as_deref(),
                Some(&credential.refresh_token),
            )
            .ok_or_else(no_refresh_token)?,
        };
        let persist = if updated.refresh_token != credential.refresh_token {
            let copy = updated.clone();
            self.blocking(move |store| store.save(&copy)).await
        } else {
            Ok(())
        };
        // Keep the replacement in memory even if the store failed during rotation.
        let access = response.access_token.clone();
        *session = Session { credential: Some(updated), access: Some(cached(&response)) };
        persist?;
        Ok(Some(access))
    }

    /// Scopes Spotify granted to the current token (empty when signed out).
    pub async fn granted_scopes(&self) -> Result<Vec<String>, Failure> {
        self.access(None).await?;
        let session = self.session.lock().await;
        Ok(session.access.as_ref().map(|a| a.scopes.clone()).unwrap_or_default())
    }

    /// The saved Client ID, if signed in.
    pub async fn client_id(&self) -> Result<Option<String>, Failure> {
        let mut session = self.session.lock().await;
        if session.credential.is_none() {
            session.credential = self.blocking(|store| store.read()).await?;
        }
        Ok(session.credential.as_ref().map(|c| c.client_id.clone()))
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
        response.json().await.map_err(|_| {
            Failure::request(TOKEN_ENDPOINT, Some(status.as_u16()), "Invalid token response")
        })
    }

    /// Finish a sign-in: trade the authorization code for tokens and save them.
    pub async fn complete_login(
        &self,
        client_id: String,
        code: &str,
        redirect_uri: &str,
        verifier: &str,
    ) -> Result<(), Failure> {
        let response = self
            .token_request(&[
                ("grant_type", "authorization_code"),
                ("client_id", &client_id),
                ("code", code),
                ("redirect_uri", redirect_uri),
                ("code_verifier", verifier),
            ])
            .await?;
        let credential = Credential {
            client_id,
            refresh_token: select_refresh_token(response.refresh_token.as_deref(), None)
                .ok_or_else(no_refresh_token)?,
        };
        let mut session = self.session.lock().await;
        let copy = credential.clone();
        self.blocking(move |store| store.save(&copy)).await?;
        *session = Session { credential: Some(credential), access: Some(cached(&response)) };
        Ok(())
    }

    pub async fn logout(&self) -> Result<(), Failure> {
        let mut session = self.session.lock().await;
        self.blocking(|store| store.delete()).await?;
        *session = Session::default();
        Ok(())
    }
}
