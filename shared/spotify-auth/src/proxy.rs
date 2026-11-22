//! The `spotify_api` command body: checks the path, adds the token, retries once on 401 and
//! reports Spotify's errors (with Retry-After) in the shared [`Failure`] shape.

use reqwest::{Client, Method, StatusCode};
use serde_json::Value;
use url::Url;

use crate::session::network_message;
use crate::{Auth, Failure};

/// Spotify answers 411 Length Required to a PUT, POST or DELETE with no Content-Length (pause, next,
/// seek, like...), and the HTTP client omits the header for an empty body, so it is set explicitly.
pub fn api_request(
    client: &Client,
    verb: Method,
    url: Url,
    token: &str,
    body: Option<&Value>,
) -> reqwest::RequestBuilder {
    let request = client.request(verb.clone(), url).bearer_auth(token);
    match body {
        Some(body) => request.json(body),
        None if verb != Method::GET => {
            request.header(reqwest::header::CONTENT_LENGTH, "0").body(Vec::<u8>::new())
        }
        None => request,
    }
}

pub fn parse_method(method: &str) -> Result<Method, Failure> {
    match method {
        "GET" => Ok(Method::GET),
        "PUT" => Ok(Method::PUT),
        "POST" => Ok(Method::POST),
        "DELETE" => Ok(Method::DELETE),
        _ => Err(Failure::local("Unsupported API method.")),
    }
}

pub fn api_url(path: &str) -> Result<Url, Failure> {
    Url::parse(&format!("https://api.spotify.com/v1{path}"))
        .ok()
        .filter(|u| path.starts_with('/') && u.path().starts_with("/v1/") && u.fragment().is_none())
        .ok_or_else(|| Failure::local("Invalid Spotify API path."))
}

impl Auth {
    pub async fn api(&self, path: &str, method: &str, body: Option<Value>) -> Result<Value, Failure> {
        let verb = parse_method(method)?;
        let url = api_url(path)?;
        let endpoint = format!("{method} {}", url.path());
        let send = |token: &str| {
            api_request(&self.client, verb.clone(), url.clone(), token, body.as_ref()).send()
        };
        let token = self
            .access(None)
            .await?
            .ok_or_else(|| Failure::local("Connect your Spotify account first."))?;
        let send_error = |e: reqwest::Error| Failure::request(&endpoint, None, network_message(&e));
        let mut response = send(&token).await.map_err(send_error)?;
        if response.status() == StatusCode::UNAUTHORIZED {
            let refreshed = self
                .access(Some(&token))
                .await?
                .ok_or_else(|| Failure::local("Connect your Spotify account in Settings."))?;
            response = send(&refreshed).await.map_err(send_error)?;
        }
        let status = response.status();
        if status == StatusCode::NO_CONTENT {
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
        let text = response.text().await.unwrap_or_default();
        match serde_json::from_str(&text) {
            Ok(value) => Ok(value),
            // Player commands succeed with a body that is not JSON: report success with no data.
            Err(_) if verb != Method::GET => Ok(Value::Null),
            Err(_) => {
                Err(Failure::request(&endpoint, Some(status.as_u16()), "Invalid JSON response"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sends a request to a local socket and returns the raw request head it received.
    async fn received_head(verb: Method, body: Option<&Value>) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url =
            Url::parse(&format!("http://{}/v1/me/library", listener.local_addr().unwrap())).unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 4096];
            let read = socket.read(&mut buffer).unwrap();
            let _ = socket.write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n");
            String::from_utf8_lossy(&buffer[..read]).to_lowercase()
        });
        let _ = api_request(&Client::new(), verb, url, "token", body).send().await;
        server.join().unwrap()
    }

    #[tokio::test]
    async fn bodiless_commands_send_content_length_zero() {
        for verb in [Method::PUT, Method::POST, Method::DELETE] {
            assert!(received_head(verb.clone(), None).await.contains("content-length: 0"), "{verb}");
        }
        assert!(!received_head(Method::GET, None).await.contains("content-length"));
        let json = received_head(Method::PUT, Some(&serde_json::json!({ "uris": ["x"] }))).await;
        assert!(json.contains("content-type: application/json") && !json.contains("content-length: 0"));
    }

    #[test]
    fn path_and_method_checks() {
        assert!(api_url("/me/tracks?limit=50").is_ok());
        assert!(api_url("me/tracks").is_err());
        assert!(parse_method("DELETE").is_ok());
        assert!(parse_method("PATCH").is_err());
    }
}
