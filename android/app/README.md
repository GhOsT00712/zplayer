# Build ZPLAYER for Android

The Tauri v2 app packages the phone UI from `../frontend`. The app reads your
library through the Spotify Web API and controls playback through the Spotify Android app.

- **Screens:** `../frontend/src` is the only frontend. `npm --prefix ../frontend run build:app`
  builds just the phone page into `../frontend/dist-app`, and Tauri packages that. The review
  page and the mock's stand-in bars and edge swipe aren't used here.
- **Native side.** `src-tauri/` contains Rust and the customized Android Studio project in
  `src-tauri/gen/android/`.
  `gen/android/app/src/main/java/io/zplayer/android/MainActivity.kt` makes the app full screen
  (status bar hidden, edge to edge, drawn under the camera cutout) and reports the gesture bar's
  height to the page.
- **Back:** Android's back gesture reaches the page through Tauri's `onBackButtonPress`
  (`../frontend/src/platform/android.ts`). It closes up next, then now playing, then the page;
  on home it leaves the app; on the lock screen it does nothing.

## Build and install

Install Node.js 22.12 or newer, JDK 17 or newer, Android SDK Platform 37,
Android platform tools, NDK `29.0.14206865`, and Rust with the
`aarch64-linux-android` target.

Download `spotify-app-remote-release-0.8.0.aar` from the
[Spotify Android SDK release](https://github.com/spotify/android-sdk/releases/tag/v0.8.0-appremote_v2.1.0-auth).
Create `src-tauri/gen/android/app/libs/` and place the file there. The pinned
artifact has SHA-256 `b5a6dd880eaf01f63a871cba9ef7af77c341f8a94ffc8fdf2e9021f9a9d4c198`.

From the repository root in PowerShell, run:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\29.0.14206865"
npm ci
npm run build:android
adb install -r android\app\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk
```

`npm run apk` (`scripts/build-apk.mjs`) builds a debug APK for 64-bit ARM phones (most phones from
the last several years). Tauri links the Rust library in with a symbolic link, which Windows only
allows in Developer Mode; without it, the script copies the library in and runs Gradle itself.
For an x86_64 emulator, run `npx tauri android build --apk --debug --target x86_64` instead.

## Signed release APK

A release APK must be signed with your own key. Create a keystore once and keep it (and its passwords)
outside Git; if you lose it, nobody can update an installed app.

```powershell
keytool -genkeypair -keystore $env:USERPROFILE\.zplayer\zplayer-release.jks -alias zplayer `
  -keyalg RSA -keysize 2048 -validity 10000
```

Then create `src-tauri/gen/android/keystore.properties` (it is git-ignored):

```text
storeFile=C:/Users/you/.zplayer/zplayer-release.jks
storePassword=...
keyAlias=zplayer
keyPassword=...
```

Run `npm run apk:release --workspace zplayer-android-app` from the repository root. The signed APK is
`src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`. Register the
key's SHA-1 (`keytool -list -v -keystore <file>`) with package `io.zplayer.android` in the Spotify
dashboard. A release-signed APK cannot be installed over a debug-signed one; uninstall first.

## Connect Spotify

Install and sign into Spotify on the phone. Use a Spotify Premium account and a
Spotify developer app with the Web API enabled. Add `io.zplayer.android://callback`
as a redirect URI. In **Android packages**, add package `io.zplayer.android`
and the SHA-1 fingerprint of the certificate used to sign your APK, then save.
Run `gradlew.bat signingReport` from `src-tauri/gen/android` to inspect signing
fingerprints after setting up the build. Enter your developer app's Client ID
on ZPLAYER's sign-in screen.
