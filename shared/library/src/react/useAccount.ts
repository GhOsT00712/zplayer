import { useCallback, useEffect, useState } from 'react';
import { missingScopes } from '../core/spotify/me';
import { messageOf } from '../core/model';
import { useLibraryContext } from './LibraryProvider';

export type AccountStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out'; error?: string }
  | { kind: 'reconnect'; missing: string[] }
  | { kind: 'signed-in' };

/**
 * Sign-in state. Users signed in before `user-library-modify` existed get `reconnect`: the app asks
 * them to connect again so liking works.
 */
export function useAccount() {
  const { auth } = useLibraryContext();
  const [status, setStatus] = useState<AccountStatus>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      if (!(await auth.restore())) return setStatus({ kind: 'signed-out' });
      const missing = missingScopes(await auth.scopes());
      setStatus(missing.length ? { kind: 'reconnect', missing } : { kind: 'signed-in' });
    } catch (error) {
      setStatus({ kind: 'signed-out', error: messageOf(error) });
    }
  }, [auth]);

  useEffect(() => void check(), [check]);

  const signIn = useCallback(
    async (clientId: string) => {
      setBusy(true);
      try {
        await auth.signIn(clientId);
        await check();
      } catch (error) {
        setStatus({ kind: 'signed-out', error: messageOf(error) });
      } finally {
        setBusy(false);
      }
    },
    [auth, check],
  );

  const signOut = useCallback(async () => {
    await auth.signOut();
    setStatus({ kind: 'signed-out' });
  }, [auth]);

  return { status, busy, signIn, signOut, settings: auth.settings };
}
