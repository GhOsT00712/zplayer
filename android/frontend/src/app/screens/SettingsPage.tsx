import { Section, TextPage } from '@zplayer/theme';
import { Choices, Swatches } from '../../phone/Choices';
import type { Ctx } from './common';

export function SettingsPage({ ctx }: { ctx: Ctx }) {
  const { prefs, remote, sync } = ctx;
  return <TextPage onBack={ctx.back} kicker="zplayer · android" title="settings">
    <Section title="theme">
      <Choices label="Theme" value={prefs.theme} onChange={prefs.setTheme}
        options={[['dark', 'dark'], ['light', 'light'], ['system', 'follow phone']] as const} />
      <Swatches value={prefs.accent} onChange={prefs.setAccent} />
    </Section>
    <Section title="animations">
      <Choices label="Animations" value={prefs.motion} onChange={prefs.setMotion}
        options={[['on', 'on'], ['off', 'off'], ['system', 'follow phone']] as const} />
    </Section>
    <Section title="library">
      <p>Songs, albums and artists come from the songs you liked and the songs in your playlists.</p>
      {sync.error && <p className="zp-error" role="alert">{sync.error}</p>}
      <button type="button" className="text-link" disabled={sync.syncing} onClick={sync.refresh}>
        {sync.syncing ? 'refreshing…' : 'refresh library'}
      </button>
    </Section>
    <Section title="playback">
      <p>{remote
        ? remote.status === 'connected' ? "Connected to the Spotify app on this phone, through Spotify's Android SDK."
          : remote.status === 'connecting' ? 'Connecting to the Spotify app…'
          : `Not connected to the Spotify app. ${remote.error ?? ''}`
        : 'Playing through the Spotify app on this phone.'}</p>
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'devices' })}>choose a device</button>
    </Section>
    <Section title="account">
      <p>Signed in to Spotify as {ctx.account?.name ?? 'your account'}.</p>
      <button type="button" className="text-link" onClick={ctx.signOut}>sign out</button>
    </Section>
    <Section title="diagnostics">
      <p>Spotify app, App Remote and WebView details for troubleshooting.</p>
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'diagnostics' })}>open diagnostics</button>
    </Section>
  </TextPage>;
}
