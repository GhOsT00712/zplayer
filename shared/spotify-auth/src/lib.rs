//! Spotify sign-in and Web API access shared by the Windows and Android apps.
//!
//! Each app supplies only what differs by OS: the redirect handling, a [`CredentialStore`] and thin
//! Tauri command wrappers. Everything else (PKCE, token refresh, the API proxy, errors, scopes) is here.

pub mod failure;
pub mod pkce;
pub mod proxy;
pub mod scopes;
pub mod session;
pub mod store;

pub use failure::Failure;
pub use pkce::{new_pkce_parameters, pkce_challenge, select_refresh_token};
pub use session::{Auth, TOKEN_ENDPOINT};
pub use store::{Credential, CredentialStore};
