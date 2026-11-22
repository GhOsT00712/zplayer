import { useEffect, useState } from 'react';
import { accents, type Accent } from '@zplayer/theme';

/** Theme and animations add "follow phone" (system) to the Windows choices. */
export type ThemePref = 'dark' | 'light' | 'system';
export type MotionPref = 'on' | 'off' | 'system';
export interface Prefs { theme: ThemePref; accent: Accent; motion: MotionPref }

export const PREFS_KEY = 'zplayer-android-mock-prefs';
const KEY = PREFS_KEY;
const DEFAULTS: Prefs = { theme: 'dark', accent: 'magenta', motion: 'on' };

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Prefs, string>>;
    return {
      theme: saved.theme === 'light' || saved.theme === 'system' ? saved.theme : 'dark',
      accent: accents.some(([name]) => name === saved.accent) ? saved.accent as Accent : 'magenta',
      motion: saved.motion === 'off' || saved.motion === 'system' ? saved.motion : 'on',
    };
  } catch {
    return DEFAULTS;
  }
}

const systemLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

/** Applies the prefs to <html> (data-theme, data-accent, data-motion) and remembers them in this browser. */
export function usePrefs() {
  const [prefs, setPrefs] = useState(load);
  const [lightSystem, setLightSystem] = useState(systemLight);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setLightSystem(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme === 'system' ? (lightSystem ? 'light' : 'dark') : prefs.theme;
    root.dataset.accent = prefs.accent;
    // "on" keeps animations even when the phone's Remove animations setting is on (same rule as Windows).
    if (prefs.motion === 'on') root.dataset.motion = 'full';
    else if (prefs.motion === 'off') root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs, lightSystem]);

  return {
    ...prefs,
    setTheme: (theme: ThemePref) => setPrefs(p => ({ ...p, theme })),
    setAccent: (accent: Accent) => setPrefs(p => ({ ...p, accent })),
    setMotion: (motion: MotionPref) => setPrefs(p => ({ ...p, motion })),
  };
}

export type PrefsApi = ReturnType<typeof usePrefs>;
