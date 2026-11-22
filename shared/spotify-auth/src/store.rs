use serde::{Deserialize, Serialize};

use crate::Failure;

#[derive(Clone, Deserialize, Serialize)]
pub struct Credential {
    pub client_id: String,
    pub refresh_token: String,
}

/// Where an app keeps the refresh token: Windows Credential Manager, Android private storage.
/// Calls may block, so the session runs them on a blocking thread.
pub trait CredentialStore: Send + Sync + 'static {
    fn read(&self) -> Result<Option<Credential>, Failure>;
    fn save(&self, credential: &Credential) -> Result<(), Failure>;
    fn delete(&self) -> Result<(), Failure>;
}
