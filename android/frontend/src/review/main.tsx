// Review page (mock only): the phone app in a frame, with controls beside it.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@zplayer/theme/tokens.css';
import '@zplayer/theme/base.css';
import '../phone/fonts.css';
import '../phone/phone.css';
import './review.css';
import { Choices, Swatches } from '../phone/Choices';
import type { DataState } from '@zplayer/theme';
import type { MockApi, ReviewState, Screen } from '../mock/bridge';

const goTo: [Screen, string][] = [
  ['home', 'home'], ['music', 'music › songs'], ['music-history', 'music › history'], ['music-albums', 'music › albums'],
  ['music-artists', 'music › artists'], ['music-playlists', 'music › playlists'], ['search', 'search'], ['artist', 'artist'], ['album', 'album'], ['playlist', 'playlist'],
  ['playlist-not-yours', 'playlist, not yours'], ['now', 'now playing'], ['up-next', 'up next'], ['lock', 'lock screen'],
  ['devices', 'devices'], ['settings', 'settings'], ['diagnostics', 'diagnostics'], ['signed-out', 'signed out'],
  ['no-spotify-app', 'no spotify app'],
];
const states: DataState[] = ['normal', 'loading', 'empty', 'error', 'rate-limited'];
const sizes = [[412, 892, 'pixel 8'], [393, 852, 'pixel 9'], [384, 832, 'galaxy s'], [360, 780, 'small']] as const;

function Review() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<ReviewState | null>(null);
  const [size, setSize] = useState(0);
  const app = (): MockApi | undefined => frame.current?.contentWindow?.zpMock;

  useEffect(() => {
    window.zpReviewUpdate = next => setState(next);
    return () => { delete window.zpReviewUpdate; };
  }, []);
  // The panel follows the app's theme and accent.
  useEffect(() => {
    if (!state) return;
    const light = state.theme === 'light' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    document.documentElement.dataset.accent = state.accent;
  }, [state]);

  const [w, h] = sizes[size]!;
  return <div className="review-page">
    <div className="review-phone" style={{ width: w, height: h }}>
      <iframe ref={frame} title="ZPLAYER phone" src="./index.html?bars=1" width={w} height={h} />
    </div>
    <aside className="review-panel">
      <p className="t-meta">ZPLAYER · ANDROID · A2 PHONE MOCK</p>
      <h1 className="review-title">review</h1>
      <p className="review-screen"><span className="t-meta">showing</span> {state?.screen ?? '…'}</p>
      <button type="button" className="review-back" onClick={() => app()?.back()}>‹ back</button>
      <p className="review-hint">Back is also Esc, or a swipe in from the phone's left edge. Swipe sideways across a list to change pivots.</p>

      <h2>go to</h2>
      <div className="review-chips">
        {goTo.map(([id, label]) => <button key={id} type="button" onClick={() => app()?.go(id)}>{label}</button>)}
      </div>

      <h2>data state</h2>
      <div className="review-chips">
        {states.map(s => <button key={s} type="button" aria-pressed={state?.dataState === s}
          onClick={() => app()?.set({ dataState: s })}>{s}</button>)}
        <button type="button" aria-pressed={state?.longTitles ?? false}
          onClick={() => app()?.set({ longTitles: !state?.longTitles })}>long titles</button>
      </div>

      {state && <>
        <h2>theme</h2>
        <Choices label="Theme" value={state.theme} onChange={theme => app()?.set({ theme })}
          options={[['dark', 'dark'], ['light', 'light'], ['system', 'follow phone']] as const} />
        <Swatches value={state.accent} onChange={accent => app()?.set({ accent })} />
        <h2>animations</h2>
        <Choices label="Animations" value={state.motion} onChange={motion => app()?.set({ motion })}
          options={[['on', 'on'], ['off', 'off'], ['system', 'follow phone']] as const} />
      </>}

      <h2>phone size</h2>
      <div className="review-chips">
        {sizes.map(([sw, sh, name], i) => <button key={name} type="button" aria-pressed={size === i}
          onClick={() => setSize(i)}>{sw} × {sh} · {name}</button>)}
      </div>
    </aside>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Review />);
