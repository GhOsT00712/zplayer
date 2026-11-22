//! Spotify OAuth primitives used by the Android and Windows apps.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

pub const TOKEN_ENDPOINT: &str = "https://accounts.spotify.com/api/token";

/// Generate the code verifier and OAuth state for a new sign-in.
pub fn new_pkce_parameters() -> (String, String) {
    (
        URL_SAFE_NO_PAD.encode(rand::random::<[u8; 64]>()),
        URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>()),
    )
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Spotify can omit the refresh token when the current one remains valid.
pub fn select_refresh_token(new: Option<&str>, previous: Option<&str>) -> Option<String> {
    new.filter(|value| !value.is_empty())
        .or(previous)
        .map(str::to_owned)
}
