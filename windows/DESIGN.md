# Changing the design

The shared components and styles live in **`../shared/theme/`**. Most visual changes start in
**`../shared/theme/tokens.css`**. Screens in `src/app/` arrange the theme pieces and fill them with Spotify data.

## The fast way to see a change

```powershell
npm run design
```

With the optional design mock at `../design-mock`, this opens a preview with sample music at
<http://127.0.0.1:5174>. Changes to `../shared/theme/` copy into the mock as you save. In the mock:

- press **`` ` ``** for the review panel: loading, empty, error and rate-limited states, signed out,
  long titles, reduced motion, theme and accent
- press **F** while a song plays for the full-screen wall

When it looks right, check it in the real app with `npm run tauri dev` (restart it after changes).

> Edit the theme under `../shared/theme/`. The preview scripts overwrite the matching files under
> `../design-mock/src/theme/`.

## Common changes

| I want to… | Change this |
| --- | --- |
| Change a colour | `tokens.css`: `--bg`, `--text`, `--text-2` (secondary), `--text-3` (inactive), `--surface`, `--line`. Dark values are at the top; light values under `[data-theme="light"]`. |
| Change the background behind every screen | `tokens.css`: `--bg-app` (the charcoal glow; light theme has its own under `[data-theme="light"]`). |
| Change or add an accent colour | `tokens.css`, the `data-accent` blocks (see "Accent colours" below), and the swatch list in `ThemeSwitch.tsx`. |
| Change the default accent or theme | `src/app/usePrefs.ts` (`'magenta'`, `'dark'`) and the same defaults in `src/main.tsx`. |
| Turn animations on or off | In the app: **settings → animations** (on, off, follow windows). The default (`'on'`) is in `src/app/usePrefs.ts`. "on" keeps animations even when Windows' **Animation effects** is off, which otherwise reaches the app as reduce-motion and stops the full-screen flips. |
| Change the font | `tokens.css`: `--font` (display: titles, rows) and `--font-text` (body, small caps). |
| Make the huge page titles bigger or smaller | `tokens.css`: `--fs-hub`. Short windows use their own value in the `@media (max-height: 720px)` block below it. |
| Change pivot header size | `tokens.css`: `--fs-pivot`. |
| Change list row text size | `tokens.css`: `--fs-row`, `--fs-row-lg`. |
| Change the playing window's song-title headline or the artist line under it | `tokens.css`: `--fs-now-headline` (song title), `--fs-now-title` (artist). |
| Change spacing | `tokens.css`: `--s1` to `--s6` (8 px grid) and `--gutter` (page side margin). |
| Change animation speed or feel | `tokens.css`: `--t-fast`, `--t-pivot`, `--t-title`, `--stagger`, `--ease`, and `--title-step` (how far the big title slides per pivot). Entrances (rows, tiles, menus fading in from left to right, one after another) use `--t-enter`, `--ease-enter` and `--stagger`; the movement itself is `@keyframes row-in` in `base.css`. |
| Change the home screen | `screens.css` → `.home…` (menu, accent strip, back button) and `.qp-…` (section headings, tile size `--qp-cell`, gaps, hint box, placeholders); narrow-window layout in the `@media (max-width: 700px)` block. Which sections and tiles appear: `HomePage` in `src/app/pages.tsx`. The ZPLAYER wordmark (startup and sign-in screens) is `Wordmark` in `Screens.tsx`, styled by `.wordmark` in `screens.css`. |
| Change the top menu (on every screen except the playing window) | Words and where they go: `sections` in `src/app/App.tsx`. Look: `TopMenu` in `Screens.tsx`; `.top-menu`, `.home-strip`, `.home-back`, `.home-nav-item` (white current word, grey others) in `screens.css`. Under it, pages hide their own corner back button (`.shell.has-menu` rules in `screens.css`). |
| Change the back button | `controls.css` → `.back-corner` (`--size`, `--inset`, 3 px ring) and `--back-ring` in `tokens.css` (the grey ring colour). The playing window has its own bigger one cut off by the top edge: `.back-corner.back-now` (size, `top`, `left`). The small one on home is `.home-back` in `screens.css`, with the accent strip `.home-strip`. The arrow is `BackIcon` in `Icons.tsx`. |
| Change the window buttons (minimize, maximize, close) | `controls.css` → `.window-controls` (size, colours, red close hover) and `--window-controls-w` (space kept free for them on the right of the top bars); glyphs in `Controls.tsx` → `WindowControls`. The window has no Windows title bar (`.decorations(false)` in `app/src-tauri/src/main.rs`); the top bars (`data-tauri-drag-region`) move it, and double-clicking them maximizes. |
| Change an icon | `Icons.tsx`. Icons are 24 × 24 SVG paths with a 1.5 px stroke. |
| Change the player bar | `player.css` → `.mini…` rules; markup in `Player.tsx` → `MiniPlayer`. |
| Change the playing window | `player.css` → `.now…` rules; markup in `Player.tsx` → `NowPlaying`. |
| Change the full-screen wall | `mosaic.css` → the variables at the top of `.mosaic` (dark theme) and `:root[data-theme="light"] .mosaic` (light theme): `--tile-filter` (how grey and dark the covers are), `--tile-now-filter` (the playing album's tiles), `--tint-opacity` (how strongly the accent colours the wall), `--gap`. In `Mosaic.tsx`: tile size (`w / 22`), how often covers flip (`350 + Math.random() * 850` ms), hide controls after `3000` ms. |
| Change empty, error or loading messages | Error and rate-limited text: `Screens.tsx` → `DataView`. Each list's empty sentence: the `empty="…"` text in `src/app/pages.tsx`. |
| Change the album-art background | `player.css` → `.backdrop…` rules (blur, pan speed) and `--scrim-hub` / `--scrim-now` in `tokens.css` (how much it's darkened). |
| Change the app icon | `app-icon.svg`, then `npm run tauri icon app-icon.svg`. |
| Rename the app | `Wordmark` default name, `BRAND` in `src/app/pages.tsx`, `<title>` in `index.html`, `productName` in `app/src-tauri/tauri.conf.json`, the window title in `app/src-tauri/src/main.rs`, and `PLAYER_NAME` in `src/spotify/SpotifyProvider.ts` (the name other Spotify devices see). |

## Where each part of the theme lives

| File | What it styles |
| --- | --- |
| `tokens.css` | all colours, the 8 accents, type sizes, spacing, motion |
| `base.css` | page reset, small-caps labels (`.t-meta`), focus outline, row entrance, reduced motion |
| `Hub.tsx`, `hub.css` | hub pages: huge title, pivot headers, swipe and keys |
| `Page.tsx`, `page.css` | app frame, page turn animation, detail pages (playlist) |
| `Screens.tsx`, `screens.css` | home, logo, text pages (settings, devices), loading/empty/error states, search box |
| `Lists.tsx`, `lists.css` | song rows, playlist rows, tiles |
| `Controls.tsx`, `controls.css` | round buttons, labelled actions, back button |
| `Player.tsx`, `player.css` | album-art background, player bar, playing window |
| `Mosaic.tsx`, `mosaic.css` | full-screen album-art wall |
| `ThemeSwitch.tsx`, `theme-switch.css` | dark/light and accent picker |
| `Icons.tsx` | every icon |
| `src/app/app.css` | app-only bits: error toast, sign-in field, diagnostics log |

## Rules that keep the look consistent

These are the Zune HD rules the design was signed off with (`../design-mock/DESIGN-PLAN.md` has
the full list):

1. **Type is the interface.** Big, thin, lowercase words for navigation; no boxes or cards.
2. **Black or white, plus one accent.** The accent marks only what's active, links and progress, never big areas.
3. **Square corners and square art.** No rounded corners, shadows or gradients (except the scrim over album art).
4. **Thin circles** for buttons, with a 2 px outline.
5. **Motion settles quickly** (`--ease`): things slide in from the right and pages swing in from the left edge.
6. Borrow the style only: no Zune name, logo or Microsoft artwork, and no bundled Segoe font files.

## Accent colours

Each accent has three values in `tokens.css`, so text stays readable in both themes:

```css
:root[data-accent="teal"]                    { --accent: #00aba9; --accent-text: #00aba9; --on-accent: #000; }
:root[data-theme="light"][data-accent="teal"] { --accent-text: #008482; }
```

- `--accent` is the colour itself, used for fills (progress, active buttons).
- `--accent-text` is used for accent words, icons and focus outlines. It must reach **4.5 : 1**
  contrast on the background: lighten it for dark theme, darken it for light theme.
- `--on-accent` is the icon colour on an accent fill: white if white reaches 3 : 1, otherwise black.

Check contrast with any WCAG contrast checker, against `#000` (dark) and `#fff` (light).

## Before you ship a design change

- Look at it in dark **and** light theme, and with two or three accents.
- Make the window small (900 × 600) and very narrow to check nothing overflows.
- Press Tab to check the focus outline is visible, and turn on reduced motion in the review panel.
- Run `npm run typecheck`.
