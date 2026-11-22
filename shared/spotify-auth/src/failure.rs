use serde::Serialize;

/// The error shape sent to the frontend by every command.
#[derive(Debug, Serialize)]
pub struct Failure {
    pub status: Option<u16>,
    pub message: String,
    pub endpoint: Option<String>,
    pub reauthenticate: bool,
}

impl Failure {
    pub fn local(message: impl Into<String>) -> Self {
        Self { status: None, message: message.into(), endpoint: None, reauthenticate: false }
    }

    pub fn request(endpoint: &str, status: Option<u16>, message: impl Into<String>) -> Self {
        Self { status, message: message.into(), endpoint: Some(endpoint.into()), reauthenticate: false }
    }
}
