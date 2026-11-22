import { useState, type CSSProperties } from 'react';
import { BackButton, RoundButton } from './Controls';
import { FullscreenIcon, HeartIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, QueueIcon, RepeatIcon, ShuffleIcon, VolumeIcon } from './Icons';
import './player.css';

export interface TrackInfo { title: string; artist: string; album: string; art: string; durationMs: number }
export interface UpNextItem { title: string; artist: string; art: string }
export type RepeatMode = 'off' | 'all' | 'one';

/**
 * What the player can do. Only play/pause, next and previous are required: leave out a handler and
 * its control is hidden (or, for seeking, the bar becomes a read-only progress line).
 */
export interface PlayerControls {
  playing: boolean;
  positionMs: number;
  modeLabel: string;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  shuffle?: boolean;
  repeat?: RepeatMode;
  volume?: number;
  liked?: boolean;
  onSeek?: (ms: number) => void;
  onShuffle?: () => void;
  onRepeat?: () => void;
  onVolume?: (value: number) => void;
  onLike?: () => void;
}

export function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Full-bleed album art that slowly pans and zooms. Crossfades when the image changes. */
export function Backdrop({ src, variant }: { src?: string; variant: 'hub' | 'now' }) {
  if (!src) return null;
  return <div className={`backdrop backdrop-${variant}`} aria-hidden="true">
    <div key={src} className="backdrop-image" style={{ backgroundImage: `url("${src}")` }} />
    <div className="backdrop-scrim" />
  </div>;
}

/** Bottom bar shown on every hub while something is loaded. Click the text to open now playing. */
export function MiniPlayer({ track, controls, onOpen }: { track: TrackInfo; controls: PlayerControls; onOpen: () => void }) {
  const progress = track.durationMs ? controls.positionMs / track.durationMs : 0;
  return <div className="mini" data-no-swipe>
    <div className="mini-progress" style={{ '--p': progress } as CSSProperties} />
    <button type="button" className="mini-open" onClick={onOpen} aria-label="Open now playing">
      <img className="mini-art" src={track.art} alt="" />
      <span className="mini-copy">
        <span className="t-meta t-accent truncate">{controls.modeLabel}</span>
        <span className="mini-title truncate">{track.title}</span>
        <span className="t-meta truncate">{track.artist}</span>
      </span>
    </button>
    <div className="mini-controls">
      <RoundButton label="previous" onClick={controls.onPrevious} size="sm"><PreviousIcon /></RoundButton>
      <RoundButton label={controls.playing ? 'pause' : 'play'} onClick={controls.onToggle}>
        {controls.playing ? <PauseIcon /> : <PlayIcon />}
      </RoundButton>
      <RoundButton label="next" onClick={controls.onNext} size="sm"><NextIcon /></RoundButton>
    </div>
  </div>;
}

/** The playing window: album art fills the screen, the artist name is the headline. */
export function NowPlaying({ track, controls, upNext, onClose, onPickUpNext, onArtist, onFullscreen }: {
  track: TrackInfo;
  controls: PlayerControls;
  /** Leave out to hide the up next column (when the source can't list the queue). */
  upNext?: UpNextItem[];
  onClose: () => void;
  onPickUpNext?: (index: number) => void;
  /** Open the artist page (closes now playing). */
  onArtist?: () => void;
  /** Switch to the full-screen album-art mosaic. */
  onFullscreen?: () => void;
}) {
  const [queueOpen, setQueueOpen] = useState(false);
  const progress = track.durationMs ? controls.positionMs / track.durationMs : 0;
  return <div className={`now${upNext ? '' : ' no-queue'}`} role="dialog" aria-label="Now playing">
    <Backdrop src={track.art} variant="now" />

    <BackButton onClick={onClose} variant="now" />
    <header className="now-top clear-back" data-tauri-drag-region data-no-swipe>
      <span className="t-meta">now playing</span>
      <span className="t-meta t-accent now-mode">{controls.modeLabel}</span>
      {onFullscreen && <RoundButton label="full screen (F)" onClick={onFullscreen} size="sm"><FullscreenIcon /></RoundButton>}
    </header>

    <h1 className="now-headline"><span key={track.title}>{track.title.toLowerCase()}</span></h1>

    <div className="now-body">
      <section className="now-main">
        <div className="now-track" key={track.title}>
          <img className="now-art" src={track.art} alt={`${track.album} cover`} />
          <div className="now-copy">
            {onArtist
              ? <button type="button" className="now-title" onClick={onArtist}>{track.artist}</button>
              : <p className="now-title">{track.artist}</p>}
            {track.album && <p className="now-sub">{track.album}</p>}
          </div>
        </div>

        <div className="now-seek">
          <span className="t-meta now-time">{formatTime(controls.positionMs)}</span>
          <input type="range" className="seek" min={0} max={track.durationMs || 1} step={1000}
            value={Math.min(controls.positionMs, track.durationMs)} style={{ '--p': progress } as CSSProperties}
            aria-label="Seek" disabled={!controls.onSeek} onChange={event => controls.onSeek?.(Number(event.target.value))} />
          <span className="t-meta now-time">-{formatTime(track.durationMs - controls.positionMs)}</span>
        </div>

        <div className="now-controls">
          {controls.onShuffle && <RoundButton label="shuffle" onClick={controls.onShuffle} size="sm" active={controls.shuffle}><ShuffleIcon /></RoundButton>}
          <RoundButton label="previous" onClick={controls.onPrevious}><PreviousIcon /></RoundButton>
          <RoundButton label={controls.playing ? 'pause' : 'play'} onClick={controls.onToggle} size="lg">
            {controls.playing ? <PauseIcon /> : <PlayIcon />}
          </RoundButton>
          <RoundButton label="next" onClick={controls.onNext}><NextIcon /></RoundButton>
          {controls.onRepeat && <RoundButton label={`repeat ${controls.repeat ?? 'off'}`} onClick={controls.onRepeat} size="sm"
            active={(controls.repeat ?? 'off') !== 'off'}>
            <RepeatIcon one={controls.repeat === 'one'} />
          </RoundButton>}
          <span className="now-spacer" />
          {controls.onLike && <RoundButton label={controls.liked ? 'unlike' : 'like'} onClick={controls.onLike} size="sm" active={controls.liked}>
            <HeartIcon filled={controls.liked} />
          </RoundButton>}
          {controls.onVolume && <label className="now-volume">
            <VolumeIcon />
            <input type="range" className="seek seek-sm" min={0} max={1} step={.01} value={controls.volume ?? 1}
              style={{ '--p': controls.volume ?? 1 } as CSSProperties} aria-label="Volume"
              onChange={event => controls.onVolume?.(Number(event.target.value))} />
          </label>}
          {upNext && <span className="now-queue-toggle">
            <RoundButton label="up next" onClick={() => setQueueOpen(open => !open)} size="sm" active={queueOpen}><QueueIcon /></RoundButton>
          </span>}
        </div>
      </section>

      {upNext && <aside className={`now-next${queueOpen ? ' is-open' : ''}`} aria-label="Up next">
        <h3 className="now-next-title">up next</h3>
        {upNext.length ? <ol className="now-next-list stagger">
          {upNext.map((item, i) => <li key={`${item.title}-${i}`} style={{ '--i': i } as CSSProperties}>
            <button type="button" className="next-row" onClick={() => onPickUpNext?.(i)}>
              <img src={item.art} alt="" />
              <span className="next-copy">
                <span className="next-title truncate">{item.title}</span>
                <span className="t-meta truncate">{item.artist}</span>
              </span>
            </button>
          </li>)}
        </ol> : <p className="t-meta">end of queue</p>}
      </aside>}
    </div>
  </div>;
}
