//! Spotify scopes. The shared list is what the library needs; each app adds its playback scope.

pub const SHARED: &[&str] = &[
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
    "user-library-modify",
    "user-read-recently-played",
];

/// Windows plays through the Web Playback SDK.
pub const WINDOWS_EXTRA: &[&str] = &["streaming"];
/// Android plays through the Spotify app (App Remote).
pub const ANDROID_EXTRA: &[&str] = &["app-remote-control"];

/// Space-separated scope string for the authorize URL.
pub fn scope_string(extra: &[&str]) -> String {
    extra.iter().chain(SHARED).copied().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn includes_library_modify_and_drops_removed_scopes() {
        let scopes = scope_string(WINDOWS_EXTRA);
        assert!(scopes.contains("user-library-modify") && scopes.contains("streaming"));
        assert!(!scopes.contains("user-top-read") && !scopes.contains("user-follow-read"));
        assert!(scope_string(ANDROID_EXTRA).contains("app-remote-control"));
    }
}
