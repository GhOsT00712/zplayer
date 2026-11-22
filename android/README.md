# ZPLAYER for Android

The portrait Android app uses Tauri v2 and imports the shared theme. See the
[Android build guide](app/README.md) for setup and Spotify playback.

- `app/` contains the Rust and Android code and packages the frontend.
- `frontend/` contains the React frontend and a browser preview with sample data.
- `frontend/src/phone/` contains Android-specific layouts and interactions.

To open the browser preview, run these commands from the repository root and visit
<http://127.0.0.1:5177/review.html>.

```powershell
npm ci
npm run preview:android
```

Edit the shared theme in `../shared/theme/`. Both app frontends import it
directly. From `android/`, run `node scripts/sync-theme.mjs` to refresh the
optional static board and copy sample data from the standalone design mock
when those local projects are present.
