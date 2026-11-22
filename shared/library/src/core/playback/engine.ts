import type { Song } from '../model';
import type { RepeatMode } from '../spotify/player';

export interface PlaybackState {
  song?: Song;
  playing: boolean;
  positionMs: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume?: number;
}

/** Implemented by sdkEngine (Windows), appRemoteEngine (Android) and connectEngine (both). */
export interface PlaybackEngine {
  readonly capabilities: { volume: boolean; devices: boolean; queue: boolean };
  getState(): PlaybackState;
  subscribe(listener: () => void): () => void;
  playSongs(uris: string[], index: number): Promise<void>;
  /** `index` is the song's place in the context when the caller knows it (App Remote needs it). */
  playContext(contextUri: string, offsetUri?: string, index?: number): Promise<void>;
  toggle(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(ms: number): Promise<void>;
  setShuffle(on: boolean): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  setVolume?(level: number): Promise<void>;
}

export const idleState: PlaybackState = { playing: false, positionMs: 0, shuffle: false, repeat: 'off' };
