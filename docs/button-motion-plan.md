# Button motion plan

Status: implemented 24 Nov 2026 (press.css, BackButton delayed click, Android back 52px). Typechecks pass; back-button press verified in the browser preview and on the Pixel 6a. Not checked: quick taps on other buttons, hardware back, reduced motion, and the Windows window.

Goal:
- The back button animates on tap or click, and its arrow turns the theme colour while pressed.
- Every other button has a small, consistent press animation.
- The Android back button is smaller.

All styling lives in `@zplayer/theme` (`shared/theme`), so both apps get the change. Only the Android size override lives in `android/frontend/src/phone/phone.css`.

## What exists today

| Button | Press today | Hover today |
|---|---|---|
| `.back-corner` (BackButton) | `scale(.94)` | ring turns white |
| `.round`, `.action .round` | `scale(.92)` | accent |
| `.row`, `.tile`, `.row-heart` | nudge / scale | accent title |
| `.pn-art`, `.pn-artist` (phone) | scale / accent | none |
| `.pivot-header`, `.home-nav-item`, `.home-back`, `.qp-tile`, `.strip-tile`, `.strip-more`, `.mini-open`, `.now-title`, `.next-row`, `.page-sub button`, `.text-link`, `.ts-modes button`, `.ts-dot`, `.swatch`, `.choice`, `.review-chips button`, `.review-back`, `.window-controls button` | **none** | some |

There are two reasons the current press is hard to see:
1. **The back button unmounts on click.** The page changes on the same tick, so its `scale(.94)` is never shown.
2. **A quick tap on Android sets `:active` for only a few milliseconds.** The 150 ms transition barely starts before it reverses. Hover rules also stick after a tap on touch screens, so `.round` stays accent after you lift your finger.

## 1. Back button press

In `shared/theme/Controls.tsx`, `BackButton` gets a pressed state:
- **On `pointerdown`:** add `is-pressed`.
- **On click:** keep `is-pressed`, wait for the press animation (about 140 ms), then call `onClick`. The page change happens after the user has seen the press.
- **Keyboard (Enter or Space):** same path through `click`.
- The Android hardware back button and Esc don't go through this button, so they stay instant.
- With reduced motion (`data-motion="reduced"` or the OS setting), call `onClick` at once.

In `shared/theme/controls.css`:
- **`.back-corner.is-pressed`, `.back-corner:active`:** scale to `.86`, and the arrow (`color`, which the SVG stroke follows) turns `var(--accent-text)`. The ring keeps `--back-ring`. Easing is `var(--ease)`.
- **Release:** springs back over about 220 ms.
- **Hover:** guard the existing ring-to-white rule with `@media (hover: hover)` so it doesn't stick on touch.
- **Mosaic** (full screen): its back button already uses `--mosaic-accent` on hover. Use that colour for the pressed arrow there too.

## 2. One press rule for every other button

Add a press section to `shared/theme/controls.css` (or a new `shared/theme/press.css` imported by `index.ts`), with two tokens in `tokens.css`:
- `--t-press: 60ms`: going down.
- `--t-release: 220ms`: coming back.

Press in fast and release slowly: `:active` sets `transition-duration: var(--t-press)` and the base rule uses `--t-release`. Even a 30 ms tap then shows a visible dip and spring back.

| Kind | Buttons | Press |
|---|---|---|
| Circles | `.round`, `.action .round`, `.home-back`, `.ts-dot`, `.swatch`, `.row-heart` | `scale(.9)` |
| Art and tiles | `.tile`, `.qp-tile`, `.strip-tile`, `.pn-art`, `.next-row`, `.mini-open` | `scale(.97)` |
| Text buttons | `.pivot-header`, `.home-nav-item`, `.strip-more`, `.now-title`, `.page-sub button`, `.text-link`, `.ts-modes button`, `.choice`, `.review-chips button`, `.review-back`, `.pn-artist` | `opacity: .6` and `scale(.98)`, with `transform-origin: left` so the text doesn't shift |
| Rows | `.row` | keep the `translateX(4px)` nudge, with the new timing |
| Window controls | `.window-controls button` | background flash only (no scale, like Windows) |

Other rules:
- Wrap every hover colour rule in `@media (hover: hover)` so touch taps don't leave buttons accent.
- Disabled buttons (`:disabled`) get no press.
- Reduced motion: `base.css` already shortens all transitions to 1 ms, so presses become instant colour or opacity changes. Nothing extra is needed.

## 3. Smaller Android back button

In `android/frontend/src/phone/phone.css`:
- `--back-size` goes from `76px` to `52px`.
- The arrow goes from 40 px to 28 px, with `stroke-width` 3 (the theme's is 2.4).
- `outline-offset` goes from -12 px to -8 px.

`.clear-back`, the top bar `min-height` and the now playing padding all read `--back-size`, so they shrink with it. Check that hub titles and page kickers still clear the ring, and that the tap target stays at least 48 px.

This also closes open issue 3 in `library-mvp-plan.md` (the 76 px ring on phone screens).

## Order of work

1. Add the tokens and the press rules (section 2), including the hover guards.
2. Add the BackButton pressed state and the delayed click (section 1).
3. Make the Android back button smaller (section 3).
4. Check both apps:
   - **Windows:** `npm run tauri --workspace zplayer -- dev`. Click the back button on a page and on now playing, use Esc, and click round buttons, tiles and pivots.
   - **Android:** `npm run build:android`, then install on the owner's Pixel only. Tap quickly and slowly, use the hardware back, and switch on reduced motion in settings.
5. Update the status in this file, and open issue 3 in `library-mvp-plan.md`.
