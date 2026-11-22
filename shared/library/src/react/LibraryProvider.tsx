import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createLibrary, type Library } from '../core/library';
import type { PlaybackEngine } from '../core/playback/engine';
import type { Transport } from '../core/transport';

/** What each app's platform layer supplies for sign-in (Tauri commands in the apps, fakes in previews). */
export interface AuthPort {
  settings(): Promise<{ clientId: string; redirectUri: string }>;
  restore(): Promise<boolean>;
  signIn(clientId: string): Promise<void>;
  signOut(): Promise<void>;
  /** Scopes Spotify granted to the saved sign-in. */
  scopes(): Promise<string[]>;
}

export interface LibraryContextValue {
  /** Null until the local index is open. */
  library: Library | null;
  transport: Transport;
  engine: PlaybackEngine;
  auth: AuthPort;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export interface LibraryProviderProps {
  transport: Transport;
  engine: PlaybackEngine;
  auth: AuthPort;
  /** Pass a ready database in previews and tests. */
  db?: IDBDatabase;
  children: ReactNode;
}

/** Creates the core library with the app's transport and playback engine and shares it with the screens. */
export function LibraryProvider({ transport, engine, auth, db, children }: LibraryProviderProps) {
  const [library, setLibrary] = useState<Library | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: Library | undefined;
    void createLibrary({ transport, db }).then((lib) => {
      if (cancelled) return lib.close();
      created = lib;
      setLibrary(lib);
    });
    return () => {
      cancelled = true;
      created?.close();
      setLibrary(null);
    };
  }, [transport, db]);

  const value = useMemo(() => ({ library, transport, engine, auth }), [library, transport, engine, auth]);
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibraryContext(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error('Wrap the app in <LibraryProvider>.');
  return value;
}
