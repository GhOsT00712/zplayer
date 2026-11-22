import { useEffect, useState, type FormEvent } from 'react';
import { messageOf } from '@zplayer/library';
import { ActionButton, PlusIcon, Section, TextPage, Wordmark } from '@zplayer/theme';
import type { Action } from '../routes';

export function SignedOutPage({ settings, signIn, reason, reconnect, busy, action, onDiagnostics }: {
  settings: () => Promise<{ clientId: string; redirectUri: string }>;
  signIn: (clientId: string) => Promise<void>;
  /** Why the user is signed out (an expired session, a failed sign-in). */
  reason?: string;
  /** Signed in before liking existed: Spotify must be asked for one more permission. */
  reconnect?: boolean;
  busy: boolean;
  action: Action;
  onDiagnostics: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [redirect, setRedirect] = useState('');
  useEffect(() => {
    let live = true;
    void settings().then(result => {
      if (!live) return;
      setClientId(previous => previous || result.clientId);
      setRedirect(result.redirectUri);
    }).catch(error => { if (live) setRedirect(messageOf(error)); });
    return () => { live = false; };
  }, [settings]);
  const connect = (event: FormEvent) => {
    event.preventDefault();
    if (clientId.trim() && !busy) action(() => signIn(clientId.trim()));
  };
  return <TextPage title={<Wordmark />}>
    <Section title={reconnect ? 'connect spotify again' : 'connect spotify'}>
      {reason && <p className="state-title">{reason}</p>}
      {reconnect && <p>ZPLAYER now lets you like songs, which Spotify needs one more permission for. Connect again to turn it on.</p>}
      <p>Sign in with a Spotify Premium account to play your music here. Your browser opens to finish signing in.</p>
      <p>Your Spotify developer app needs this redirect URI: <code className="code">{redirect || 'reading…'}</code></p>
      <form className="connect-form" onSubmit={connect} data-no-swipe>
        <input className="field" aria-label="Spotify Client ID" placeholder="client id" autoComplete="off" spellCheck={false}
          disabled={busy} value={clientId} onChange={event => setClientId(event.target.value)} />
        <ActionButton icon={<PlusIcon />} label={busy ? 'waiting for the browser…' : 'connect'}
          onClick={() => { if (clientId.trim() && !busy) action(() => signIn(clientId.trim())); }} />
      </form>
    </Section>
    <Section title="trouble?">
      <button type="button" className="text-link" onClick={onDiagnostics}>open diagnostics</button>
    </Section>
  </TextPage>;
}

export function StartingPage() {
  return <TextPage title={<Wordmark />}><p className="page-note">starting…</p></TextPage>;
}
