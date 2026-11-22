use std::{sync::Mutex, thread};

use tauri::{AppHandle, State};
use tiny_http::{Header, Method, Response, Server};
use url::Url;

const ADDRESS: &str = "127.0.0.1:17653";
const ORIGIN: &str = "http://127.0.0.1:17653";

#[derive(Default)]
pub struct FrontendServer(Mutex<bool>);

pub fn allow_navigation(url: &Url) -> bool {
    let app_origin = matches!(
        (url.scheme(), url.host_str()),
        ("tauri", Some("localhost")) | ("http", Some("tauri.localhost"))
    );
    // WebKit calls the navigation delegate for the SDK's encrypted-media iframe, too.
    let sdk_frame = url.origin().ascii_serialization() == "https://sdk.scdn.co"
        && url.path().starts_with("/embedded/");
    app_origin
        || sdk_frame
        || url.origin().ascii_serialization() == ORIGIN
        || url.as_str() == "about:blank"
}

#[tauri::command]
pub fn loopback_bootstrap(
    app: AppHandle,
    server: State<'_, FrontendServer>,
    needed: bool,
) -> Result<Option<&'static str>, String> {
    let force = std::env::var("ZPLAYER_FORCE_LOOPBACK").as_deref() == Ok("1");
    if !force && !needed {
        return Ok(None);
    }
    start_loopback(app, server).map(Some)
}

fn start_loopback(
    app: AppHandle,
    server: State<'_, FrontendServer>,
) -> Result<&'static str, String> {
    let mut started = server.0.lock().map_err(|_| "Loopback server lock failed")?;
    if *started {
        return Ok(ORIGIN);
    }
    let listener = Server::http(ADDRESS)
        .map_err(|error| format!("Could not start frontend at {ORIGIN}: {error}"))?;
    thread::Builder::new()
        .name("zplayer-frontend".into())
        .spawn(move || {
            for request in listener.incoming_requests() {
                let correct_host = request
                    .headers()
                    .iter()
                    .any(|h| h.field.equiv("Host") && h.value.as_str() == ADDRESS);
                if !correct_host || request.method() != &Method::Get {
                    let _ = request.respond(Response::empty(403));
                    continue;
                }
                let path = request.url().split('?').next().unwrap_or_default();
                let asset_path = match path {
                    "/" | "/index.html" => "index.html",
                    path if path.starts_with("/assets/") && !path.contains("..") => &path[1..],
                    _ => {
                        let _ = request.respond(Response::empty(404));
                        continue;
                    }
                };
                if let Some(asset) = app.asset_resolver().get(asset_path.into()) {
                    let _ = request.respond(
                        Response::from_data(asset.bytes)
                            .with_header(
                                Header::from_bytes("Content-Type", asset.mime_type.as_bytes())
                                    .unwrap(),
                            )
                            .with_header(
                                Header::from_bytes("X-Content-Type-Options", "nosniff").unwrap(),
                            )
                            .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap()),
                    );
                } else {
                    let _ = request.respond(Response::empty(404));
                }
            }
        })
        .map_err(|error| format!("Could not start loopback thread: {error}"))?;
    *started = true;
    Ok(ORIGIN)
}
