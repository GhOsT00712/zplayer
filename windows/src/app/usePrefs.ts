import { useEffect, useState } from 'react';
import { accents, type Accent, type ThemeMode } from '@zplayer/theme';

const KEY = 'zplayer-prefs';

/**
 * Animations: "on" plays them even when Windows' "Animation effects" is off (that setting reaches
 * the app as reduce-motion), "off" stops them, "system" follows Windows.
 */
export type MotionPref = 'on' | 'off' | 'system';
export interface Prefs { theme: ThemeMode; accent: Accent; motion: MotionPref }

export function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Prefs, string>>;
    return {
      theme: saved.theme === 'light' ? 'light' : 'dark',
      accent: accents.some(([name]) => name === saved.accent) ? saved.accent as Accent : 'magenta',
      motion: saved.motion === 'off' || saved.motion === 'system' ? saved.motion : 'on',
    };
  } catch {
    return { theme: 'dark', accent: 'magenta', motion: 'on' };
  }
}

/** Puts the preferences on <html>, where the theme's CSS reads them. */
export function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.accent = prefs.accent;
  if (prefs.motion === 'on') root.dataset.motion = 'full';
  else if (prefs.motion === 'off') root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}

/** Theme, accent and animations, remembered on this computer. */
export function usePrefs() {
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => {
    applyPrefs(prefs);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs]);
  return {
    ...prefs,
    setTheme: (theme: ThemeMode) => setPrefs(p => ({ ...p, theme })),
    setAccent: (accent: Accent) => setPrefs(p => ({ ...p, accent })),
    setMotion: (motion: MotionPref) => setPrefs(p => ({ ...p, motion })),
  };
}
