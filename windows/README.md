# ZPLAYER for Windows

A Spotify player for Windows in the style of the Zune HD: huge lowercase titles, pivots you swipe
between, album art filling the background, and a full-screen album-art wall. Built with Tauri v2,
React and the Spotify Web Playback SDK. Music plays inside the app (Widevine in WebView2), or the
app can remote-control another Spotify device.

- To change how it looks, read **[DESIGN.md](DESIGN.md)**.
- The design was tested in a standalone prototype and clickable mock. If you have the
  mock locally, place it at `design-mock/` in the repository root for live theme preview.

## What you need

- Windows 10 or 11 with the WebView2 runtime (Windows 11 has it already).
- [Node.js](https://nodejs.org/) 22.12 or newer.
- [Rust](https://rustup.rs/) stable, MSVC toolchain.
- Visual Studio Build Tools with **Desktop development with C++**.
  ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
- A **Spotify Premium** account and a Spotify developer app (next section).

## Set up Spotify (once)

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app
   (Development Mode is fine). Tick **Web API** and **Web Playback SDK**.
2. Add this redirect URI exactly, then save:

   ```text
   http://127.0.0.1:17654/callback
   ```

3. If you'll listen with a different Spotify account than the one that owns the developer app, add
   it under **User Management**.
4. Copy the app's **Client ID**. ZPLAYER asks for it on its first screen. You can also set the
   environment variable `SPOTIFY_CLIENT_ID` before starting the app to fill it in.

Your Client ID and Spotify sign-in are saved in Windows Credential Manager (as `io.zplayer.desktop`).
**Sign out** in settings removes them.

> ZPLAYER and the original pivot-player prototype both use ports 17653 and 17654. Run one at a time.

## Run it while developing

From the repository root:

```powershell
npm ci
npm run tauri --workspace zplayer -- dev
```

The first run compiles the Rust side, which takes a few minutes; later runs take seconds.
The dev command builds the frontend and embeds it (no live-reload dev server, because Spotify's
DRM check needs the real app origin). **After changing frontend files, stop it and run it again.**
If you have the separate `design-mock/` project beside this folder, use `npm run design`
for live theme preview (see [DESIGN.md](DESIGN.md)).

## Build the installer

From the repository root:

```powershell
npm ci
npm run build:windows
```

This produces:

| File | What it is |
| --- | --- |
| `windows/app/src-tauri/target/release/bundle/nsis/ZPLAYER_0.1.0_x64-setup.exe` | the installer to share or install |
| `windows/app/src-tauri/target/release/zplayer.exe` | the app itself, runnable without installing |

The first release build takes several minutes, and Tauri downloads the NSIS installer tool on the first
run. The installer isn't code-signed, so Windows SmartScreen may warn when you open it; choose
**More info → Run anyway**.

To change the version number, edit `version` in `app/src-tauri/tauri.conf.json` and `package.json`.
To change the app icon, edit `app-icon.svg` and run `npm run tauri icon app-icon.svg`.

## Other commands

Run these from `windows/`.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | checks the TypeScript |
| `npm run build` | type-checks and builds the frontend into `dist/` |
| `npm run design` | opens the design mock with this app's theme and live reload ([DESIGN.md](DESIGN.md)) |
| `npm run theme:sync` | copies this app's theme into the design mock once |
| `cargo test --manifest-path app/src-tauri/Cargo.toml --locked` | runs the sign-in (PKCE and token refresh) tests |

## How playback works

- **In-app playback.** After sign-in, the Spotify SDK has up to 12 seconds to register this window as
  a Spotify Connect device called **ZPLAYER**. Picking a song then plays it here.
- **Remote control.** If the SDK can't start, the app switches to controlling another Spotify device
  (phone, speaker, computer). Pick one in **devices**. Restart the app to try in-app playback again.
- **Playlists.** Spotify lists songs only for playlists you own or collaborate on; others can still be
  played as a whole.
- If WebView2's default origin lacks a secure context or the DRM API, the app reloads itself from
  `http://127.0.0.1:17653` automatically. To force that for testing, set `ZPLAYER_FORCE_LOOPBACK=1`
  before `npm run tauri dev`. **settings → diagnostics** shows the details.

## What's in the app today

a menu along the top of every screen except the playing window · home (pins with your liked songs and pinned playlists, your playlists, and history) · quickplay (history, new, favourites) · music (liked
songs, playlists) · playlist pages · search (songs) · devices · settings (account, theme, animations, playback)
· diagnostics · the player bar · the playing window with seeking · full screen (**F**).

The window has no Windows title bar. Drag it by the top bar of any page (double-click to maximize);
minimize, maximize and close are the small buttons in the top-right corner.

Albums, artists, shuffle, repeat, volume, liking songs and pins come with the backend work
listed in `../design-mock/DESIGN-PLAN.md`. Until then the theme hides those controls.

## Animations

If Windows' **Settings → Accessibility → Visual effects → Animation effects** is off, Windows asks
apps to reduce motion. ZPLAYER plays its animations anyway by default (pivots, page turns, the
full-screen covers flipping). To follow Windows instead, choose **settings → animations → follow windows**.

## Folder map

```text
../shared/theme/ the look: tokens, components, CSS (see DESIGN.md)
src/
  app/          screens and app logic: App.tsx (navigation, player), pages.tsx (screens), data.ts
  spotify/      Spotify sign-in, Web API calls and the Web Playback SDK
  music.ts      the provider interface the screens talk to
  environment.ts origin and DRM checks
app/src-tauri/  Rust side: sign-in, token storage, loopback origin, window
scripts/        tauri launcher and the design preview script
app-icon.svg    source for the app icon
```
