// Inside the Tauri Android app (A3): hook the phone UI up to Android.
// In a plain browser (the mock, the review page) none of this runs.
import { exit, onBackButtonPress } from '@tauri-apps/api/app';
import { inTauri } from '../mock/bridge';

declare global {
  interface Window {
    /** Set by MainActivity.kt: the gesture bar's height in CSS px (the status bar is hidden). */
    ZpInsets?: { bottom: () => number };
    /** Set by MainActivity.kt: the lock screen link. setPlaying tells Android whether to show the album
     *  wall when the phone locks; unlock asks Android to dismiss its own lock screen (PIN, fingerprint). */
    ZpLock?: { setPlaying: (playing: boolean) => void; unlock: () => void };
    /** Called by MainActivity.kt when the screen turns off while music plays: show the lock screen. */
    zpLock?: () => void;
  }
}

export function startAndroid() {
  if (!inTauri) return;
  const root = document.documentElement;
  root.classList.add('is-android');

  // The gesture bar is drawn over the app; MainActivity reports its height, and tells us again
  // (a "zp-insets" event) whenever it changes, for example when the phone rotates.
  const readInsets = () => {
    const bottom = window.ZpInsets?.bottom();
    if (typeof bottom === 'number') root.style.setProperty('--inset-bottom', `${bottom}px`);
  };
  readInsets();
  window.addEventListener('zp-insets', readInsets);

  // Android's back gesture and button: the same back as the app's own (closes up next, then now
  // playing, then the page). On home, or signed out, it leaves the app as Android apps do.
  // The lock screen ignores it.
  void onBackButtonPress(() => {
    const app = window.zpMock;
    if (!app) return;
    const screen = app.state().screen;
    if (screen === 'home' || screen.startsWith('signed out')) void exit(0);
    else app.back();
  });
}
