import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackIcon } from './Icons';
import './controls.css';

/** Thin-circle icon button (Zune HD transport style). */
export function RoundButton({ label, onClick, children, size = 'md', active = false }: {
  label: string; onClick: () => void; children: ReactNode; size?: 'sm' | 'md' | 'lg'; active?: boolean;
}) {
  return <button type="button" className={`round round-${size}${active ? ' is-active' : ''}`}
    aria-label={label} title={label} aria-pressed={active || undefined} onClick={onClick}>{children}</button>;
}

/**
 * The iconic back button: a bold left arrow inside a thin circle, tucked into the top-left corner
 * outside the content margin. Place it as a direct child of a positioned page; it floats above the
 * content and stays put while the page scrolls.
 */
export function BackButton({ onClick, label = 'back', variant }: {
  onClick: () => void; label?: string;
  /** "now": the playing window's bigger ring, cut off by the top edge. */
  variant?: 'now';
}) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const reduced = () => document.documentElement.dataset.motion === 'reduced'
    || (document.documentElement.dataset.motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Hold the pressed look for a moment before leaving, so the tap is seen even though the page changes.
  const click = () => {
    if (reduced()) return onClick();
    setPressed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setPressed(false); onClick(); }, 140);
  };
  return <button type="button" className={`back-corner${variant === 'now' ? ' back-now' : ''}${pressed ? ' is-pressed' : ''}`}
    aria-label={label} title={label} onPointerDown={() => setPressed(true)}
    onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
    onClick={click} data-no-swipe><BackIcon /></button>;
}

/**
 * Minimize, maximize/restore and close for a window without the Windows title bar.
 * Thin glyphs in the top-right corner; close turns red on hover like Windows.
 */
export function WindowControls({ maximized, onMinimize, onToggleMaximize, onClose }: {
  maximized: boolean; onMinimize: () => void; onToggleMaximize: () => void; onClose: () => void;
}) {
  const glyph = (d: string) => <svg viewBox="0 0 10 10" aria-hidden="true"><path d={d} /></svg>;
  return <div className="window-controls" data-no-swipe>
    <button type="button" aria-label="minimize" title="minimize" onClick={onMinimize}>{glyph('M0 5.5h10')}</button>
    <button type="button" aria-label={maximized ? 'restore' : 'maximize'} title={maximized ? 'restore' : 'maximize'} onClick={onToggleMaximize}>
      {glyph(maximized ? 'M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z' : 'M.5.5h9v9h-9z')}
    </button>
    <button type="button" className="is-close" aria-label="close" title="close" onClick={onClose}>{glyph('M.5.5l9 9M9.5.5l-9 9')}</button>
  </div>;
}

/** Circled icon followed by a lowercase label, for page actions (play, shuffle, save, follow). */
export function ActionButton({ icon, label, onClick, active }: {
  icon: ReactNode; label: string; onClick: () => void; active?: boolean;
}) {
  return <button type="button" className={`action${active ? ' is-active' : ''}`}
    aria-pressed={active === undefined ? undefined : active} onClick={onClick}>
    <span className="round round-sm" aria-hidden="true">{icon}</span>
    <span>{label}</span>
  </button>;
}
