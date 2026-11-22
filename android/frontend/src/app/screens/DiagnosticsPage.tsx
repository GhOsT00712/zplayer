import { Section, TextPage } from '@zplayer/theme';
import { inTauri } from '../../mock/bridge';
import type { Ctx } from './common';

export function DiagnosticsPage({ ctx }: { ctx: Ctx }) {
  const { remote } = ctx;
  const rows: [string, string][] = [
    ['mode', 'App Remote · Spotify app on this phone'],
    ['runs in', inTauri ? 'the Android app' : 'a browser preview with sample data'],
    ['Spotify app', window.ZpRemote ? (window.ZpRemote.installed() ? 'installed' : 'not found') : 'not available here'],
    ['App Remote', remote?.status ?? 'off'],
    ['last error', remote?.error ?? '—'],
    ['signed in as', ctx.account?.name ?? '—'],
    ['library sync', ctx.sync.syncing ? 'running' : ctx.sync.error ?? 'idle'],
    ['WebView', navigator.userAgent],
    ['origin', window.location.origin],
  ];
  return <TextPage onBack={ctx.back} kicker="settings" title="diagnostics">
    <Section title="environment">
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Section>
  </TextPage>;
}
