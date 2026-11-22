import type { CSSProperties } from 'react';
import './theme-switch.css';

export type ThemeMode = 'dark' | 'light';
export const accents = [
  ['magenta', '#ff0097'], ['orange', '#f7941d'], ['red', '#e51400'], ['blue', '#1ba1e2'],
  ['green', '#60a917'], ['purple', '#a200ff'], ['teal', '#00aba9'], ['brown', '#a0522d'],
] as const;
export type Accent = typeof accents[number][0];

/** Text toggle for dark / light plus square accent swatches. */
export function ThemeSwitch({ theme, accent, onTheme, onAccent }: {
  theme: ThemeMode;
  accent: Accent;
  onTheme: (theme: ThemeMode) => void;
  onAccent: (accent: Accent) => void;
}) {
  return <div className="theme-switch" data-no-swipe>
    <div className="ts-modes" role="group" aria-label="Theme">
      {(['dark', 'light'] as const).map(mode =>
        <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => onTheme(mode)}>{mode}</button>)}
    </div>
    <div className="ts-accents" role="group" aria-label="Accent colour">
      {accents.map(([name, colour]) =>
        <button key={name} type="button" className="ts-dot" title={name} aria-label={name} aria-pressed={accent === name}
          style={{ '--dot': colour } as CSSProperties} onClick={() => onAccent(name)} />)}
    </div>
  </div>;
}
