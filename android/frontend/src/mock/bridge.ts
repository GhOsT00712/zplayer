// Link between the phone app and the review page (review.html), which shows the app in an iframe.
// Both are served from the same origin, so the review page calls window.zpMock directly.
import type { DataState } from '@zplayer/theme';
import type { MotionPref, ThemePref } from './usePrefs';
import type { Accent } from '@zplayer/theme';

export const screens = [
  'home', 'quickplay', 'music', 'music-albums', 'search', 'artist', 'album', 'playlist', 'playlist-not-yours',
  'now', 'up-next', 'lock', 'devices', 'settings', 'diagnostics', 'signed-out', 'no-spotify-app',
] as const;
export type Screen = typeof screens[number];

export interface ReviewState {
  screen: string;
  dataState: DataState;
  longTitles: boolean;
  theme: ThemePref;
  accent: Accent;
  motion: MotionPref;
}

export interface MockApi {
  go: (screen: Screen) => void;
  /** The Android back gesture or button. */
  back: () => void;
  set: (patch: Partial<Omit<ReviewState, 'screen'>>) => void;
  state: () => ReviewState;
}

declare global {
  interface Window {
    zpMock?: MockApi;
    /** Defined by the review page; the app calls it whenever its state changes. */
    zpReviewUpdate?: (state: ReviewState) => void;
  }
}

/** Tell the review page (if there is one) what the app is showing. */
export function report(state: ReviewState) {
  try { window.parent?.zpReviewUpdate?.(state); } catch { /* not framed, or another origin */ }
}

const params = new URLSearchParams(location.search);

/** True inside the Tauri app (A3), false in a browser. */
export const inTauri = '__TAURI_INTERNALS__' in window;

/** The review page draws fake status and gesture bars when it opens the app with ?bars=1. */
export const simulateBars = params.get('bars') === '1';

/**
 * Open a screen and settings straight from the URL, for links and screenshots:
 * ?screen=album&theme=light&accent=teal&state=loading&motion=off
 */
export function applyUrl(api: MockApi) {
  const screen = params.get('screen');
  if (screen && (screens as readonly string[]).includes(screen)) api.go(screen as Screen);
  const state = params.get('state');
  if (state) api.set({ dataState: state as DataState });
}

/** Theme, accent and motion from the URL go into the saved prefs before the first render, so nothing repaints. */
export function seedPrefsFromUrl(key: string) {
  const theme = params.get('theme');
  const accent = params.get('accent') as Accent | null;
  const motion = params.get('motion');
  if (!theme && !accent && !motion) return;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
    localStorage.setItem(key, JSON.stringify({ ...saved, ...(theme && { theme }), ...(accent && { accent }), ...(motion && { motion }) }));
  } catch { /* storage unavailable */ }
}
