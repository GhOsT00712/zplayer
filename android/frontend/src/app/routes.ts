/** Music hub pivots, in order. History sits right after songs. */
export const PIVOT = { songs: 0, history: 1, albums: 2, artists: 3, playlists: 4 } as const;

export type RouteName =
  | { kind: 'home' }
  | { kind: 'music'; pivot?: number }
  | { kind: 'search' }
  | { kind: 'devices' }
  | { kind: 'settings' }
  | { kind: 'diagnostics' }
  | { kind: 'album'; id: string; name: string; artwork?: string }
  | { kind: 'artist'; id: string; name: string }
  | { kind: 'playlist'; id: string; title: string };
