import type { HistoryEntry } from '../model';
import type { Transport } from '../transport';
import { isSong, mapSong, type RawPage, type RawTrack } from './mappers';

/** Spotify returns only the last 50 plays, and only songs played for at least 30 seconds. */
export async function fetchRecentlyPlayed(transport: Transport): Promise<HistoryEntry[]> {
  const page = await transport.call<RawPage<{ track: RawTrack | null; played_at: string }>>(
    '/me/player/recently-played?limit=50',
  );
  const entries: HistoryEntry[] = [];
  for (const item of page.items) {
    if (isSong(item.track)) entries.push({ playedAt: Date.parse(item.played_at), song: mapSong(item.track) });
  }
  return entries;
}
