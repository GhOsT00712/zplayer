use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc7636_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn refresh_token_selection() {
        assert_eq!(select_refresh_token(None, Some("old")).unwrap(), "old");
        assert_eq!(select_refresh_token(Some(""), Some("old")).unwrap(), "old");
        assert_eq!(select_refresh_token(Some("new"), Some("old")).unwrap(), "new");
        assert!(select_refresh_token(None, None).is_none());
    }
}
