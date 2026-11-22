import { useCallback, useEffect, useState } from 'react';
import { messageOf, spotify, type Account } from './spotify';

export type AuthStatus = 'checking' | 'signed-out' | 'signed-in';

const CLIENT_KEY = 'zplayer-android-client-id'; // not a secret: remembered so it isn't typed twice

/**
 * The real Spotify sign-in, inside the Tauri app. With `enabled` false (the browser mock) it
 * reports "signed in" and does nothing, so the mock keeps its own fake sign-in.
 */
export function useSpotifyAccount(enabled: boolean) {
  const [status, setStatus] = useState<AuthStatus>(enabled ? 'checking' : 'signed-in');
  const [account, setAccount] = useState<Account | null>(null);
  const [clientId, setClientId] = useState(() => { try { return localStorage.getItem(CLIENT_KEY) ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        const settings = await spotify.settings();
        if (settings.clientId) setClientId(previous => previous || settings.clientId);
        if (await spotify.restore()) {
          const me = await spotify.me();
          if (alive) { setAccount(me); setStatus('signed-in'); }
        } else if (alive) setStatus('signed-out');
      } catch (failure) {
        if (alive) { setError(messageOf(failure)); setStatus('signed-out'); }
      }
    })();
    return () => { alive = false; };
  }, [enabled]);

  const connect = useCallback(async () => {
    const id = clientId.trim();
    setBusy(true);
    setError(null);
    try {
      try { localStorage.setItem(CLIENT_KEY, id); } catch { /* storage unavailable */ }
      await spotify.signIn(id);
      setAccount(await spotify.me());
      setStatus('signed-in');
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }, [clientId]);

  const signOut = useCallback(async () => {
    try { await spotify.signOut(); } catch (failure) { setError(messageOf(failure)); }
    setAccount(null);
    setStatus('signed-out');
  }, []);

  return { status, account, clientId, setClientId, busy, error, connect, signOut };
}

export type SpotifyAccount = ReturnType<typeof useSpotifyAccount>;
