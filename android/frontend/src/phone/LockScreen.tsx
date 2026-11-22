import { useEffect, useRef, useState } from 'react';
import { Mosaic, type FullscreenAdapter, type PlayerControls, type TrackInfo } from '@zplayer/theme';

const inPlace: FullscreenAdapter = { enter: async () => {}, exit: async () => {} };
const noop = () => {};
const UNLOCK = 120; // px of upward swipe that unlocks

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The album wall moved here from the app: while music plays and the phone locks, ZPLAYER shows over
 * the lock screen (an Android activity allowed to show when locked). The theme's Mosaic fills the
 * screen, with a huge thin clock at the top in the Zune HD's style and the now-playing card at the
 * bottom. Swipe up to unlock. There's no back button: back does nothing on a lock screen.
 */
export function LockScreen({ track, covers, controls, onUnlock }: {
  track: TrackInfo; covers: string[]; controls: PlayerControls; onUnlock: () => void;
}) {
  const now = useClock();
  const [leaving, setLeaving] = useState(false);
  const [dy, setDy] = useState(0);
  const start = useRef<{ y: number; id: number } | null>(null);

  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const unlock = () => { setLeaving(true); window.setTimeout(onUnlock, 300); };

  return <div className={`lock${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label="Lock screen"
    style={dy ? { transform: `translateY(${dy}px)` } : undefined}
    onPointerDown={event => {
      if ((event.target as Element).closest('button, input')) return;
      start.current = { y: event.clientY, id: event.pointerId };
    }}
    onPointerMove={event => {
      if (start.current?.id === event.pointerId) setDy(Math.min(0, event.clientY - start.current.y));
    }}
    onPointerUp={event => {
      if (start.current?.id !== event.pointerId) return;
      const travelled = start.current.y - event.clientY;
      start.current = null;
      setDy(0);
      if (travelled > UNLOCK) unlock();
    }}
    onPointerCancel={() => { start.current = null; setDy(0); }}>
    <Mosaic track={track} covers={covers} controls={controls} onClose={noop} fullscreen={inPlace} />
    <div className="lock-shade" />
    <div className="lock-clock" aria-live="off">
      <span className="lock-time">{time}</span>
      <span className="lock-date">{weekday}, <b>{date}</b></span>
    </div>
    <span className="t-meta lock-hint">swipe up to unlock</span>
  </div>;
}
