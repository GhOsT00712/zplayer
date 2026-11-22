# ZPLAYER

ZPLAYER is a Spotify player with Windows and portrait Android apps built with Tauri v2 and React.

- [Windows setup and build](windows/README.md)
- [Android setup and build](android/app/README.md)
- [Android browser preview](android/README.md)

## Workspace

| Directory | Contents |
| --- | --- |
| `android/` | Tauri Android app, Kotlin Spotify bridge, and portrait frontend |
| `windows/` | Tauri Windows app in `app/src-tauri/` and desktop frontend in `src/` |
| `shared/theme/` | React components and CSS imported by both frontends as `@zplayer/theme` |
| `shared/spotify-auth/` | Rust helpers for Spotify PKCE and refresh tokens |

Run `npm ci` at the repository root to install all JavaScript workspaces from
one lockfile. Run `npm run typecheck` to check both frontends. After installing
the platform prerequisites, run `npm run build:android` for a debug APK or
`npm run build:windows` for a Windows installer.

## What goes in Git

| Keep | Purpose |
| --- | --- |
| React, TypeScript, CSS, Rust and Kotlin source | App behavior and UI |
| npm and Cargo manifests and lockfiles, Tauri config and capabilities | Dependency versions, bundling and permissions |
| Android Gradle files, wrapper scripts and wrapper JAR, manifest and resources | Build the customized Android project in `android/app/src-tauri/gen/android/` |
| App icons, Android's Selawik font and its license | Assets used by the apps |
| Shared theme, OAuth helpers, and Android preview data | Build both apps without the separate design mock |

The ignore rules exclude dependency folders, generated bindings and build output, SDK downloads, local machine settings, credentials, signing keys, workspace notes, the original proof of concept, and design screenshots.

Each developer supplies their Spotify Client ID at sign-in. Android also needs the [App Remote SDK from Spotify](https://github.com/spotify/android-sdk/releases/tag/v0.8.0-appremote_v2.1.0-auth) and a Spotify dashboard entry for the app's signing certificate.

## Distributing builds

Attach a release-signed Android APK and a Windows installer to a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) when they are ready to distribute. Keep signing keys and build outputs outside Git. The Android build command documented here produces a developer debug APK.
