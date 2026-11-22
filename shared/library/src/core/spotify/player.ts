/** Spotify Connect over the Web API: devices, transfer, play, seek, shuffle, repeat, volume. */
import type { Device, Song } from '../model';
import type { Transport } from '../transport';
import { isSong, mapSong, type RawTrack } from './mappers';

export type RepeatMode = 'off' | 'all' | 'one';

interface RawDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

export async function fetchDevices(transport: Transport): Promise<Device[]> {
  const result = await transport.call<{ devices: RawDevice[] }>('/me/player/devices');
  return result.devices.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    active: d.is_active,
    restricted: d.is_restricted,
  }));
}

export interface ConnectState {
  song?: Song;
  playing: boolean;
  positionMs: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume?: number;
  deviceId?: string | null;
  deviceName?: string;
}

interface RawState {
  device: RawDevice & { volume_percent?: number | null };
  is_playing: boolean;
  progress_ms?: number | null;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  item?: RawTrack | null;
}

export async function fetchPlayerState(transport: Transport): Promise<ConnectState | null> {
  const raw = await transport.call<RawState | null>('/me/player');
  if (!raw) return null;
  return {
    song: isSong(raw.item) ? mapSong(raw.item) : undefined,
    playing: raw.is_playing,
    positionMs: raw.progress_ms ?? 0,
    shuffle: raw.shuffle_state,
    repeat: raw.repeat_state === 'track' ? 'one' : raw.repeat_state === 'context' ? 'all' : 'off',
    volume: raw.device.volume_percent ?? undefined,
    deviceId: raw.device.id,
    deviceName: raw.device.name,
  };
}

const withDevice = (path: string, deviceId?: string | null) =>
  deviceId ? `${path}${path.includes('?') ? '&' : '?'}device_id=${encodeURIComponent(deviceId)}` : path;

export const transferTo = (t: Transport, deviceId: string, play = false) =>
  t.call<void>('/me/player', 'PUT', { device_ids: [deviceId], play });
export const playUris = (t: Transport, uris: string[], index: number, deviceId?: string | null) =>
  t.call<void>(withDevice('/me/player/play', deviceId), 'PUT', { uris, offset: { position: index } });
export const playContext = (t: Transport, contextUri: string, offsetUri?: string, deviceId?: string | null) =>
  t.call<void>(withDevice('/me/player/play', deviceId), 'PUT', {
    context_uri: contextUri,
    ...(offsetUri ? { offset: { uri: offsetUri } } : {}),
  });
export const resume = (t: Transport, deviceId?: string | null) => t.call<void>(withDevice('/me/player/play', deviceId), 'PUT');
export const pause = (t: Transport, deviceId?: string | null) => t.call<void>(withDevice('/me/player/pause', deviceId), 'PUT');
export const skipNext = (t: Transport, deviceId?: string | null) => t.call<void>(withDevice('/me/player/next', deviceId), 'POST');
export const skipPrevious = (t: Transport, deviceId?: string | null) =>
  t.call<void>(withDevice('/me/player/previous', deviceId), 'POST');
export const seekTo = (t: Transport, ms: number, deviceId?: string | null) =>
  t.call<void>(withDevice(`/me/player/seek?position_ms=${Math.max(0, Math.round(ms))}`, deviceId), 'PUT');
export const setShuffleState = (t: Transport, on: boolean, deviceId?: string | null) =>
  t.call<void>(withDevice(`/me/player/shuffle?state=${on}`, deviceId), 'PUT');
export const setRepeatState = (t: Transport, mode: RepeatMode, deviceId?: string | null) =>
  t.call<void>(
    withDevice(`/me/player/repeat?state=${mode === 'one' ? 'track' : mode === 'all' ? 'context' : 'off'}`, deviceId),
    'PUT',
  );
export const setVolumeLevel = (t: Transport, percent: number, deviceId?: string | null) =>
  t.call<void>(withDevice(`/me/player/volume?volume_percent=${Math.min(100, Math.max(0, Math.round(percent)))}`, deviceId), 'PUT');
