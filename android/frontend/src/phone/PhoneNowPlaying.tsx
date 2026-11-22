import { useRef, type CSSProperties, type PointerEvent } from 'react';
import {
  Backdrop, BackButton, HeartIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, QueueIcon, RepeatIcon, RoundButton,
  ShuffleIcon, formatTime, type PlayerControls, type TrackInfo, type UpNextItem,
} from '@zplayer/theme';
import { DevicesIcon } from './icons';

const SWIPE = 60; // px sideways that opens or closes up next

/** Horizontal swipe on an element: calls back with -1 (left) or 1 (right). Vertical moves are left alone. */
function useSwipe(onSwipe: (direction: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  return {
    onPointerDown: (event: PointerEvent) => {
      if ((event.target as Element).closest('input')) return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    onPointerUp: (event: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== event.pointerId) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? -1 : 1);
    },
    onPointerCancel: () => { start.current = null; },
  };
}

/**
 * Portrait now playing, laid out as the owner asked (18 Nov 2026): artist in bold caps, album in
 * light caps, the art (about 58% of the width), the seek bar along its bottom edge with the times
 * under it, the song title, then the controls, all sitting low on the screen. The album art, blurred, fills the background. "up next" is a panel that
 * slides in from the right: swipe left, or the queue button. Back closes it first.
 */
export function PhoneNowPlaying({ track, controls, queue, queueOpen, onQueue, onClose, onPick, onDevices, onArtist }: {
  track: TrackInfo;
  controls: PlayerControls;
  /** Songs after the current one. */
  queue: UpNextItem[];
  queueOpen: boolean;
  onQueue: (open: boolean) => void;
  onClose: () => void;
  onPick: (offset: number) => void;
  onDevices?: () => void;
  onArtist?: () => void;
}) {
  const progress = track.durationMs ? controls.positionMs / track.durationMs : 0;
  const playIcon = controls.playing ? <PauseIcon /> : <PlayIcon />;
  const playLabel = controls.playing ? 'pause' : 'play';
  const swipeMain = useSwipe(direction => { if (direction < 0) onQueue(true); });
  const swipeQueue = useSwipe(direction => { if (direction > 0) onQueue(false); });

  return <div className="pnow" role="dialog" aria-label="Now playing">
    <Backdrop src={track.art} variant="now" />
    <BackButton onClick={queueOpen ? () => onQueue(false) : onClose} />

    <div className="pn-main" {...swipeMain}>
      <header className="pn-head" key={track.title}>
        {onArtist
          ? <button type="button" className="pn-artist" onClick={onArtist}>{track.artist}</button>
          : <h1 className="pn-artist">{track.artist}</h1>}
        <p className="pn-album">{track.album}</p>
      </header>

      <div className="pn-art-row">
        <button type="button" className="pn-art" onClick={controls.onToggle} aria-label={playLabel}>
          <img key={track.art} src={track.art} alt={`${track.album} cover`} />
        </button>
        <div className="pn-side">
          {controls.onShuffle && <RoundButton label="shuffle" size="sm" active={controls.shuffle} onClick={controls.onShuffle}><ShuffleIcon /></RoundButton>}
          {controls.onRepeat && <RoundButton label={`repeat ${controls.repeat ?? 'off'}`} size="sm" active={(controls.repeat ?? 'off') !== 'off'}
            onClick={controls.onRepeat}><RepeatIcon one={controls.repeat === 'one'} /></RoundButton>}
          {controls.onLike && <RoundButton label={controls.liked ? 'unlike' : 'like'} size="sm" active={controls.liked}
            onClick={controls.onLike}><HeartIcon filled={controls.liked} /></RoundButton>}
          {onDevices && <RoundButton label="devices" size="sm" onClick={onDevices}><DevicesIcon /></RoundButton>}
          <RoundButton label="up next" size="sm" onClick={() => onQueue(true)}><QueueIcon /></RoundButton>
        </div>
      </div>
      <div className="pn-seek">
        <input type="range" className="seek" min={0} max={track.durationMs || 1} step={1000}
          value={Math.min(controls.positionMs, track.durationMs)} style={{ '--p': progress } as CSSProperties}
          aria-label="Seek" disabled={!controls.onSeek} onChange={event => controls.onSeek?.(Number(event.target.value))} />
        <div className="pn-times">
          <span>{formatTime(controls.positionMs)}</span>
          <span>−{formatTime(track.durationMs - controls.positionMs)}</span>
        </div>
      </div>

      <p className="pn-title" key={`t-${track.title}`}>{track.title}</p>

      <div className="pn-controls">
        <div className="pn-transport">
          <RoundButton label="previous" onClick={controls.onPrevious}><PreviousIcon /></RoundButton>
          <RoundButton label={playLabel} size="lg" onClick={controls.onToggle}>{playIcon}</RoundButton>
          <RoundButton label="next" onClick={controls.onNext}><NextIcon /></RoundButton>
        </div>
      </div>
    </div>

    <section className={`pn-queue${queueOpen ? ' is-open' : ''}`} aria-label="Up next" aria-hidden={!queueOpen} {...swipeQueue}>
      <h2 className="pn-queue-title">up next</h2>
      <div className="pn-queue-list">
        <p className="t-meta pane-label">playing</p>
        <div className="next-row is-active">
          <img src={track.art} alt="" />
          <span className="next-copy"><span className="next-title truncate">{track.title}</span><span className="t-meta truncate">{track.artist}</span></span>
        </div>
        <p className="t-meta pane-label">next</p>
        {queue.length ? <ol className="pn-next">
          {queue.map((item, i) => <li key={`${item.title}-${i}`}>
            <button type="button" className="next-row" onClick={() => onPick(i)} tabIndex={queueOpen ? 0 : -1}>
              <img src={item.art} alt="" />
              <span className="next-copy"><span className="next-title truncate">{item.title}</span><span className="t-meta truncate">{item.artist}</span></span>
            </button>
          </li>)}
        </ol> : <p className="empty">end of the queue</p>}
      </div>
      <div className="pn-queue-controls">
        <RoundButton label="previous" onClick={controls.onPrevious}><PreviousIcon /></RoundButton>
        <RoundButton label={playLabel} size="lg" onClick={controls.onToggle}>{playIcon}</RoundButton>
        <RoundButton label="next" onClick={controls.onNext}><NextIcon /></RoundButton>
      </div>
    </section>
  </div>;
}
