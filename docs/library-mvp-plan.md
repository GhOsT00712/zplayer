# Library MVP plan (Windows and Android)

Status: **MVP built; first release v0.1.0 published (24 Nov 2026).** Last updated 24 Nov 2026.
Other Claude threads: read this block first, update the table when a milestone changes, and keep it short.

## Where things are

- Repo: <https://github.com/GhOsT00712/zplayer> (public). `main` is the default branch; the MVP work was
  built on `library-mvp` and fast-forward merged into `main`; tag `v0.1.0` is on `main`.
- Run Windows: `npm run tauri --workspace zplayer -- dev` (stop the old `zplayer.exe` first or the build
  fails). Install on the Pixel: `npm run build:android`, then `adb install -r` to the owner's Pixel
  only, chosen with `adb -s <serial>` (other devices are often attached and are not the owner's; the serial is
  kept in local, git-ignored notes, not in this repo).
- Release builds: `npm run build:windows` (NSIS installer) and `npm run apk:release --workspace
  zplayer-android-app` (signed APK). Release signing: keystore and its passwords live in
  `%USERPROFILE%\.zplayer\` and in the git-ignored `android/app/src-tauri/gen/android/keystore.properties`.
  Never commit or print them. Release key SHA-1 `8B:11:F4:1A:52:8E:8B:BF:E7:DE:81:C5:EF:83:13:2A:12:43:E6:B6`
  (register it, with package `io.zplayer.android`, in the Spotify dashboard app whose Client ID the
  release APK uses). A release-signed APK cannot be installed over the debug-signed one without uninstalling.

## Milestones

| # | Milestone | Status | Verified how | Still open |
|---|---|---|---|---|
| 1 | Foundations: shared Rust auth crate, `@zplayer/library` package | Done | 5 Rust tests, 29 library tests, both shells compile | none |
| 2 | Core behaviour: Spotify calls, sync, queries, like, history, search, Connect engine | Done | Fake-Spotify tests, including a 6,000-song library | Check sync and like against a real account |
| 3 | React bindings: provider and hooks | Done | Typecheck, and the Android preview exercises them | No DOM-level hook tests |
| 4 | Windows UX | Done, owner is testing | Typecheck, builds, owner runs it | First-run playback needs confirming (below) |
| 5 | Android UX | Done, installed on the Pixel | Typecheck, builds, browser preview with sample data | App Remote path only on the owner's phone |
| 6 | Polish: states, refresh library, large library | Done | 6,000-song test, preview states | none |
| R1 | Release v0.1.0 (Windows installer + signed Android APK) | Done, published: <https://github.com/GhOsT00712/zplayer/releases/tag/v0.1.0> | APK signature and fingerprint checked; Windows installer built; checksums attached | The release APK and installer have not been run by anyone yet; the owner's phone still has the debug build |

### Changes made after the first build (from the owner's feedback)

- Albums skip songs Spotify gives no album for; the playlists list shows only playlists you own or collaborate on
  (saved-from-others are hidden, owner's call).
- History keeps one row per song: replaying a song moves it to the top.
- Now playing: Windows keeps the horizontal shuffle and repeat buttons; the phone has a button column beside
  the art (shuffle, repeat, like, devices, up next), centred on the art. Back button styles are as they were
  (a full-screen-style back button was tried on both apps and reverted).
- Hub heading never slides fully off screen (at most 55% of the word); album and artist art fills the whole
  background, menu bar included; descenders no longer clip on now playing.
- A song that arrives without a cover (another device playing) is looked up once so the art fills in live.

### Open issues

1. **First launch playback fails, works after a restart** (reported 24 Nov on the Pixel, and earlier on Windows
   where the log showed the app fell back to remote control). No cause found yet. Needed: the message that
   appears at the bottom of the phone screen, or the event log in Windows settings, from a failed first launch.
   Suspects: the first big library sync rate-limiting playback; App Remote not connected yet when the first
   tap lands.
2. Cross-device album art: the live look-up is a safety net, not a confirmed fix.
3. Phone screens other than now playing still use the larger 76 px back ring.
4. Deep list reads use cursor offsets; switch to key-range paging if slow on a device.

## Verification summary

- **Tested**: `shared/spotify-auth` (5 Rust tests), `shared/library` (29 tests on a fake Spotify, including a
  6,000-song library), typecheck and builds of both frontends, the Android browser preview.
- **Not yet checked against real Spotify on every path**: sync and like on a real account, the Android app with
  the Spotify app on every screen, and the reconnect prompt for users signed in before `user-library-modify`.
- **Differences from the plan below**: Windows has no `platform/transport.ts` (`SdkEngine.transport` is the
  transport, so rate-limit waits and failures show in diagnostics); Android's App Remote engine looks each
  song up (`GET /tracks/{id}`) to get artist ids; `playContext` takes an optional song index for App
  Remote; playlist pages take the playlist id and read it from the index.

## Goal

ZPLAYER shows **your own music only**: songs you liked and songs in your playlists. Albums and
artists are built from those songs, not from Spotify's saved albums or followed artists. Both apps
get the same sections and data, backed by one shared library package.

## Navigation stays as each app has it

The two apps keep their current, different UX. Only what the sections contain changes.

- **Windows**: start page, top menu and hubs stay as they are. The top menu becomes
  **now playing · songs · albums · playlists · artists · search · settings**. The song, album,
  artist and playlist entries open the music hub at that pivot, as **playlists** does now.
  Quickplay goes; devices moves into settings. The start page tiles show liked songs, your playlists
  and recent history instead of pins.
- **Android**: phone home menu, hubs and now playing stay as they are. The home menu already lists
  these sections. Pins, quickplay, saved albums and followed artists go.
- **Both**: the music hub's pivots are **songs · history · albums · artists · playlists**. History
  sits right after songs, so it's one swipe from the songs list.

## Sections

| Section | What it shows |
|---|---|
| **now playing** | Opens the now playing screen. With nothing playing, opens **songs** |
| **songs** | Every song in your library, newest first, infinite scroll |
| **history** | What you played, newest first, infinite scroll (next to songs) |
| **albums** | Every album that has at least one of your songs, A–Z, infinite scroll |
| **playlists** | Playlists you created or collaborate on. Playlists you only saved from other people are not listed (owner's call, 22 Nov 2026) |
| **artists** | Every artist on at least one of your songs, A–Z, infinite scroll |
| **search** | Spotify song search, infinite scroll |
| **settings** | Account, theme, diagnostics; on Windows also the playback device |

Removed: quickplay (pins, new, favourites), Windows' separate devices section, top tracks, saved
albums and followed artists as sources.

## Features

### 1. Your library = liked songs + your playlists' songs
- **Songs** holds every liked song plus every song in a playlist whose songs Spotify lets us read.
  A song in both places appears once.
- Spotify's Development Mode lists songs **only for playlists you own or collaborate on**. Playlists
  you saved from other people have songs that can't be read, so they can't appear in songs, albums or
  artists, and they are not listed under **playlists** either.
- Podcast episodes and local files are left out.

### 2. Albums and artists from your songs
- **Albums**: grouped by Spotify album ID. The album page shows the **full album** in track order
  (`GET /albums/{id}`, more pages from its tracks link for albums over 50 songs), with your songs
  marked by a filled heart. Each album is fetched once when first opened and kept in the local
  index. Playing from the album page plays the album from the tapped song.
- **Artists**: every credited artist on a song (so featured artists get a page too). The artist page
  lists your songs by that artist, grouped by album.

### 3. Infinite scrolling
- Songs, albums, artists, search, playlist pages and history load more as you scroll near the end,
  replacing the current **more** button.
- The paging logic is shared: `useInfiniteList` in `@zplayer/library/react` returns the items, the
  loading state and a sentinel ref watched with `IntersectionObserver`. Each app decides where the
  sentinel sits and how loading looks.

### 4. Search
- Spotify song search, 10 results per request (the Development Mode limit), next page loaded on
  scroll. Typing waits about 450 ms before searching, as Windows does now.
- Tap to play. Each row has a heart to like the song.

### 5. Like = liked in Spotify
- Heart on now playing and on song rows. Liking calls `PUT /me/library?uris=spotify:track:…` and
  unliking calls `DELETE /me/library?uris=…`, so the change shows in Spotify's Liked Songs.
- The song appears in or leaves **songs** straight away (local index update). Unliking a song that
  is also in one of your playlists keeps it in songs.
- Needs the new scope `user-library-modify`. Users signed in before the change must connect again;
  the app detects the missing scope from the token response and asks.
- Android moves from App Remote's like call to the same Web API call, so both apps share one path.

### 6. Now playing replaces quickplay (Windows)
- The first top-menu item becomes **now playing**. Clicking it opens the now playing screen (the
  same overlay the mini player opens). With nothing playing, it opens **songs**, as Android does.

### 7. History, newest first
- Spotify's recently-played endpoint returns only the **last 50** plays, and only songs played for at
  least 30 seconds.
- So each app also writes its own play log: every time the current song changes, add an entry
  (song, time). On start, merge Spotify's recently-played list into the log to pick up plays from
  other devices. Keep the newest 2,000 entries.
- Shown as the **history** pivot right after **songs** in the music hub, newest first with
  infinite scroll. Tapping a row plays that song.

## Architecture

### The rule: behaviour is shared, UX is per app

| Layer | Where | Contains | Must not contain |
|---|---|---|---|
| **Core** | `shared/library/src/core` | Data model, Spotify Web API calls, local index, sync, queries, like, history, search, playback contract | React, JSX, CSS, Tauri imports, wording shown to users |
| **React bindings** | `shared/library/src/react` | Hooks and one context provider that expose core to screens | Markup, styles, layout |
| **Look** | `shared/theme` (exists) | Presentational components and CSS: rows, tiles, hubs, player controls, heart | Data fetching, Spotify knowledge, navigation |
| **Auth and API proxy** | `shared/spotify-auth` (Rust, exists) | PKCE, token refresh, Spotify API proxy, error shape, scopes | Redirect handling or credential storage for one OS |
| **App UX** | `windows/src`, `android/frontend/src` | Screens, navigation, menus, wording, layout, platform glue, playback engine | Direct Spotify API calls or their own copies of library logic |

Dependencies point one way: apps → `@zplayer/library/react` → `@zplayer/library` core, and
apps → `@zplayer/theme`. Theme and library never import each other. Core takes its transport (the
Tauri `spotify_api` command, or mock data in the browser preview) as a parameter, so the Android
preview and review pages run on the same hooks with fake data.

### Folder layout

```text
zplayer/
├─ package.json                      npm workspaces: + shared/library
├─ docs/
│  └─ library-mvp-plan.md            this plan
├─ shared/
│  ├─ library/                       @zplayer/library   (NEW, behaviour only)
│  │  ├─ package.json                exports "." (core) and "./react"
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ core/
│  │     │  ├─ index.ts
│  │     │  ├─ model.ts              Song, Album, Artist, Playlist, HistoryEntry, Device, Page
│  │     │  ├─ transport.ts          Transport interface; 429 / Retry-After backoff; Failure type
│  │     │  ├─ spotify/              one file per API area, each maps Spotify JSON to model.ts
│  │     │  │  ├─ me.ts              account, granted scopes
│  │     │  │  ├─ liked.ts           /me/tracks, PUT/DELETE /me/library
│  │     │  │  ├─ playlists.ts       /me/playlists, /playlists/{id}/items
│  │     │  │  ├─ albums.ts          /albums/{id} and its track pages
│  │     │  │  ├─ search.ts          /search (songs, 10 per page)
│  │     │  │  ├─ recent.ts          /me/player/recently-played
│  │     │  │  └─ player.ts          Spotify Connect: devices, transfer, play, seek, shuffle, repeat, volume
│  │     │  ├─ store/                IndexedDB local index
│  │     │  │  ├─ db.ts              schema, versions, migrations
│  │     │  │  ├─ songs.ts  albums.ts  artists.ts  playlists.ts  history.ts
│  │     │  ├─ sync/
│  │     │  │  ├─ syncLibrary.ts     first run and later runs; one at a time
│  │     │  │  ├─ syncLiked.ts       newest-first, stop at first known song
│  │     │  │  └─ syncPlaylists.ts   re-read only on snapshot_id change
│  │     │  ├─ library/
│  │     │  │  ├─ queries.ts         paged section reads (songs, albums, artists, album, artist, history)
│  │     │  │  ├─ like.ts            like / unlike, Spotify + index
│  │     │  │  └─ history.ts         play log, merge with recently-played, keep newest 2,000
│  │     │  └─ playback/
│  │     │     ├─ engine.ts          PlaybackEngine interface and PlaybackState
│  │     │     └─ connectEngine.ts   PlaybackEngine over Spotify Connect (Web API)
│  │     ├─ react/
│  │     │  ├─ index.ts
│  │     │  ├─ LibraryProvider.tsx   creates core with the app's transport and engine
│  │     │  ├─ useAccount.ts  useLibrarySync.ts  useSection.ts  useInfiniteList.ts
│  │     │  ├─ useLiked.ts  useHistory.ts  useSearch.ts  usePlayback.ts
│  │     └─ test/                    vitest: mappers, sync, queries, like, history (fake transport)
│  ├─ theme/                         @zplayer/theme     (exists, look only)
│  │  └─ … add heart and liked mark to Row; loading row for infinite lists
│  └─ spotify-auth/                  Rust crate          (exists, grows)
│     └─ src/
│        ├─ lib.rs
│        ├─ pkce.rs                  (today's lib.rs content)
│        ├─ scopes.rs                shared scope list + per-app extras (streaming / app-remote-control)
│        ├─ session.rs               token cache, refresh, invalid_grant → reauthenticate
│        ├─ proxy.rs                 spotify_api: path check, GET/PUT/POST/DELETE, 401 retry, Retry-After
│        ├─ failure.rs               error shape sent to the frontend
│        └─ store.rs                 CredentialStore trait (each app implements it)
├─ windows/                          Windows UX
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ app/                        App.tsx (shell, top menu, route stack), routes.ts, app.css
│  │  │  └─ screens/                 StartPage, MusicHub, AlbumPage, ArtistPage, PlaylistPage,
│  │  │                              SearchHub, SettingsPage (with devices), DiagnosticsPage, SignedOutPage
│  │  ├─ playback/                   sdkEngine.ts (Web Playback SDK, falls back to connectEngine), sdk.ts
│  │  └─ platform/                   environment.ts, transport.ts (Tauri invoke), usePrefs.ts
│  └─ app/src-tauri/src/             main.rs, origin.rs, auth.rs (loopback redirect + Windows
│                                    Credential Manager store + thin command wrappers)
└─ android/                          Android UX
   ├─ frontend/src/
   │  ├─ main.tsx
   │  ├─ app/                        App.tsx (home menu, route stack)
   │  │  └─ screens/                 HomePage, MusicHub, AlbumPage, ArtistPage, PlaylistPage,
   │  │                              SearchHub, SettingsPage, DevicesPage, DiagnosticsPage, SignedOutScreen
   │  ├─ phone/                      (exists) lock screen, system bars, phone now playing, fonts, phone.css
   │  ├─ playback/                   appRemoteEngine.ts (wraps window.ZpRemote)
   │  ├─ platform/                   android.ts (exists), transport.ts (Tauri invoke)
   │  ├─ mock/                       (exists) browser preview: mock transport + fake engine
   │  └─ review/                     (exists) design review page
   └─ app/src-tauri/
      ├─ src/                        lib.rs, auth.rs (deep-link redirect + app-storage store + thin commands)
      └─ gen/android/…/              Kotlin: MainActivity, SpotifyRemote, PlaybackExitService (unchanged role)
```

### What moves where

| Today | Becomes |
|---|---|
| `windows/src/music.ts` (types, `MusicProvider`) | `shared/library/src/core/model.ts` and `playback/engine.ts` |
| `windows/src/spotify/SpotifyProvider.ts`: Web API parts (playlists, tracks, search, devices, Connect control) | `core/spotify/*` and `core/playback/connectEngine.ts` |
| `windows/src/spotify/SpotifyProvider.ts`: SDK parts, `sdk.ts` | `windows/src/playback/sdkEngine.ts`, `sdk.ts` |
| `windows/src/app/data.ts` `usePaged` | `react/useInfiniteList.ts` |
| `windows/src/app/pages.tsx` | `windows/src/app/screens/*` (one file per screen) |
| `windows/src/app/usePins.ts` | removed (pins go) |
| `android/frontend/src/spotify/library.ts` | `core/spotify/*` |
| `android/frontend/src/spotify/spotify.ts`, `useSpotifyAccount.ts` | `core/spotify/me.ts`, `react/useAccount.ts`; Tauri call in `platform/transport.ts` |
| `android/frontend/src/spotify/useSpotifyPlayer.ts` | `android/frontend/src/playback/appRemoteEngine.ts`; its like calls → `core/library/like.ts` |
| `android/frontend/src/spotify/pages.tsx`, `mock/pages.tsx` (real-data parts) | `android/frontend/src/app/screens/*` |
| Both `auth.rs` (≈85% the same) | `shared/spotify-auth/src/*`; each app keeps only redirect, storage and command wrappers |

### Key interfaces (core)

```ts
interface Transport {            // Tauri spotify_api in the apps, fake data in the preview
  call<T>(path: string, method?: 'GET' | 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<T>;
}

interface PlaybackEngine {        // sdkEngine (Windows), appRemoteEngine (Android), connectEngine (both)
  readonly capabilities: { volume: boolean; devices: boolean; queue: boolean };
  getState(): PlaybackState;      // current song, playing, position, shuffle, repeat
  subscribe(listener: () => void): () => void;
  playSongs(uris: string[], index: number): Promise<void>;
  playContext(contextUri: string, offsetUri?: string): Promise<void>;
  toggle(): Promise<void>; next(): Promise<void>; previous(): Promise<void>;
  seek(ms: number): Promise<void>; setShuffle(on: boolean): Promise<void>;
  setRepeat(mode: 'off' | 'all' | 'one'): Promise<void>; setVolume?(level: number): Promise<void>;
}
```

`usePlayback(engine)` watches the current song and records each change in history, so neither app
writes history itself.

### Sync
- **First run**: read all liked songs (`/me/tracks`, 50 per request) and all playlists
  (`/me/playlists`), then the songs of each owned or collaborative playlist
  (`/playlists/{id}/items`). Sections fill in as pages arrive.
  Example cost: 2,000 liked songs and 20 playlists of 100 songs is about 80 requests, once.
- **Later runs**: liked songs are read newest first and reading stops at the first song already
  stored. If Spotify's total count still differs, run a full liked-songs pass to catch unlikes.
  A playlist is re-read only when its `snapshot_id` changed.
- When: at sign-in, at app start, when the app comes back to the foreground (at most every 10
  minutes), and from a **refresh library** button in settings.
- All your Development Mode apps share one request quota, so sync never runs twice at once and
  waits out 429s.

### Scopes
Shared list in `shared/spotify-auth/src/scopes.rs`: add `user-library-modify`; drop `user-top-read`
and `user-follow-read`. Windows adds `streaming`, Android adds `app-remote-control`. The granted
scopes are exposed so the frontend can ask the user to reconnect when one is missing.

## Order of work

1. **Foundations**
   - Rust: split `shared/spotify-auth` into the files above; both `auth.rs` shrink to redirect,
     storage and command wrappers; new scopes; `DELETE` on Windows.
   - `shared/library`: package, workspace entry, `model.ts`, `transport.ts`, `store/db.ts`, vitest.
2. **Core behaviour**: `spotify/*`, sync, queries, like, history, `connectEngine`, with tests on a
   fake transport; then checked against a real account.
3. **React bindings**: provider and hooks.
4. **Windows UX**: move screens into `app/screens/`, `sdkEngine`, new top menu with now playing,
   music hub pivots, album and artist pages, search, hearts, history. Devices moves into settings.
   Remove pins and quickplay.
5. **Android UX**: move screens into `app/screens/`, `appRemoteEngine`, music hub pivots on the
   phone home menu; mock and review pages run on a mock transport. Remove quickplay, pins and the
   saved-albums and followed-artists sources.
6. **Polish**: empty, loading, error and rate-limited states for every section; refresh library in
   settings; check sync with a large library (5,000+ songs).
