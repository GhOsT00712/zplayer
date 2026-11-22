import type { Transport } from '../transport';
import {
  fetchPlayerState,
  pause,
  playContext as playContextRequest,
  playUris,
  resume,
  seekTo,
  setRepeatState,
  setShuffleState,
  setVolumeLevel,
  skipNext,
  skipPrevious,
  type RepeatMode,
} from '../spotify/player';
import { idleState, type PlaybackEngine, type PlaybackState } from './engine';

export interface ConnectEngineOptions {
  /** Poll interval while someone is subscribed. */
  pollMs?: number;
  /** Device to send commands to; defaults to the active device. */
  deviceId?: () => string | null | undefined;
}

/** PlaybackEngine over Spotify Connect (Web API): controls whichever device is playing. */
export function createConnectEngine(transport: Transport, options: ConnectEngineOptions = {}): PlaybackEngine & { refresh(): Promise<void> } {
  const { pollMs = 3000, deviceId = () => undefined } = options;
  let state: PlaybackState = idleState;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let stateAt = Date.now();

  const publish = (next: PlaybackState) => {
    state = next;
    stateAt = Date.now();
    listeners.forEach((listener) => listener());
  };

  async function refresh() {
    try {
      const fetched = await fetchPlayerState(transport);
      publish(fetched ? { ...fetched } : idleState);
    } catch {
      // keep the last known state; the next poll tries again
    }
  }

  /** Run a command, then re-read the state so the screen shows what Spotify did. */
  const command = async (run: () => Promise<unknown>) => {
    await run();
    await refresh();
  };

  return {
    capabilities: { volume: true, devices: true, queue: false },
    getState: () =>
      state.playing ? { ...state, positionMs: state.positionMs + (Date.now() - stateAt) } : state,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        void refresh();
        timer = setInterval(() => void refresh(), pollMs);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && timer) clearInterval(timer);
      };
    },
    refresh,
    playSongs: (uris, index) => command(() => playUris(transport, uris, index, deviceId())),
    playContext: (contextUri, offsetUri) => command(() => playContextRequest(transport, contextUri, offsetUri, deviceId())),
    toggle: () => command(() => (state.playing ? pause(transport, deviceId()) : resume(transport, deviceId()))),
    next: () => command(() => skipNext(transport, deviceId())),
    previous: () => command(() => skipPrevious(transport, deviceId())),
    seek: (ms) => command(() => seekTo(transport, ms, deviceId())),
    setShuffle: (on) => command(() => setShuffleState(transport, on, deviceId())),
    setRepeat: (mode: RepeatMode) => command(() => setRepeatState(transport, mode, deviceId())),
    setVolume: (level) => command(() => setVolumeLevel(transport, level, deviceId())),
  };
}
