import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BackIcon } from '@zplayer/theme';

/**
 * Stand-in for what Android draws over a full-screen app, shown when the review page asks for it:
 * the gesture bar at the bottom. There's no status bar:
 * the app hides it (it slides in for a moment when you swipe down from the top). The lock screen
 * hides the gesture bar too.
 */
export function SystemBars({ locked }: { locked: boolean }) {
  return <>
    {!locked && <div className="sys-gesture" aria-hidden="true" />}
  </>;
}

const EDGE = 20;      // px from the left edge where the back gesture starts
const TRIGGER = 72;   // px of travel that counts as back

/**
 * Android's back gesture: swipe in from the left edge. The press is taken before the page sees it,
 * as Android does, so it never turns into a pivot swipe. Shows the system's arrow bubble while dragging.
 */
export function EdgeBack({ onBack }: { onBack: () => void }) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (event.clientX > EDGE || event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      const s = start.current;
      if (!s || event.pointerId !== s.id) return;
      event.stopPropagation();
      setDrag({ x: Math.max(0, event.clientX - s.x), y: event.clientY });
    };
    const up = (event: PointerEvent) => {
      const s = start.current;
      if (!s || event.pointerId !== s.id) return;
      start.current = null;
      setDrag(null);
      event.stopPropagation();
      if (event.type === 'pointerup' && event.clientX - s.x > TRIGGER) backRef.current();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  if (!drag) return null;
  const pull = Math.min(drag.x, TRIGGER * 1.4);
  return <div className={`edge-back${drag.x > TRIGGER ? ' is-ready' : ''}`} aria-hidden="true"
    style={{ '--pull': `${pull}px`, top: drag.y - 24 } as CSSProperties}><BackIcon /></div>;
}
