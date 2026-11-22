import { ActionButton, PlusIcon, Section, TextPage, Wordmark } from '@zplayer/theme';

/** Signed out. Without the Spotify app installed, it says so and offers its store page instead. */
export function SignedOutScreen({ spotifyInstalled, reconnect, onConnect, onGetSpotify, form }: {
  spotifyInstalled: boolean;
  /** Signed in before liking existed: Spotify must be asked for one more permission. */
  reconnect?: boolean;
  onConnect: () => void;
  onGetSpotify: () => void;
  /** The real sign-in inside the Android app: the Client ID field and Spotify's errors. */
  form?: { clientId: string; setClientId: (id: string) => void; busy: boolean; error?: string; connect: () => void };
}) {
  return <TextPage title={<Wordmark />}>
    {spotifyInstalled
      ? <Section title={reconnect ? 'connect spotify again' : 'connect spotify'}>
          {reconnect && <p>ZPLAYER now lets you like songs, which Spotify needs one more permission for. Connect again to turn it on.</p>}
          <p>ZPLAYER plays your music through the Spotify app on this phone. Sign in with Spotify to start; full control needs Premium.</p>
          {form && <>
            <input className="zp-field" aria-label="Spotify Client ID" placeholder="client id" autoComplete="off" autoCapitalize="none"
              spellCheck={false} inputMode="text" disabled={form.busy} value={form.clientId}
              onChange={event => form.setClientId(event.target.value)} />
            <p className="zp-field-note">The Client ID from your app in the Spotify Developer Dashboard (the same one ZPLAYER for Windows uses).</p>
          </>}
          <ActionButton icon={<PlusIcon />} label={form?.busy ? 'waiting for spotify…' : 'connect'}
            onClick={() => { if (!form) onConnect(); else if (!form.busy && form.clientId.trim()) form.connect(); }} />
          {form?.error && <p className="zp-error" role="alert">{form.error}</p>}
        </Section>
      : <Section title="get spotify first">
          <p>ZPLAYER plays your music through the Spotify app, and it isn't on this phone yet. Install it, sign in, then come back.</p>
          <ActionButton icon={<PlusIcon />} label="get spotify" onClick={onGetSpotify} />
        </Section>}
  </TextPage>;
}
