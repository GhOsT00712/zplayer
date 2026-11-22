import { useEffect, useState } from 'react';
import { DataView, List, Row, Section, TextPage, ThemeSwitch, type DataState } from '@zplayer/theme';
import type { AppDevice } from '../../playback/sdkEngine';
import type { Ctx } from './common';

/** Where music plays. Spotify Connect devices show up here while they are online. */
function PlaybackDevices({ ctx }: { ctx: Ctx }) {
  const [devices, setDevices] = useState<AppDevice[]>([]);
  const [state, setState] = useState<DataState>('loading');
  const [request, setRequest] = useState(0);
  const { snapshot, engine } = ctx;
  useEffect(() => {
    let live = true;
    void engine.devices().then(list => {
      if (!live) return;
      setDevices(list);
      setState(list.length ? 'normal' : 'empty');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [engine, request, snapshot.mode, snapshot.targetId]);

  return <>
    <p>{snapshot.mode === 'in-app playback' ? 'Playing in this app.'
      : snapshot.mode === 'remote control' ? `Controlling ${snapshot.targetName ?? 'another device'}.` : `Playback is ${snapshot.mode}.`}</p>
    {snapshot.reason && <p>{snapshot.reason}</p>}
    <DataView state={state} empty="no devices available. open Spotify on a phone, speaker or computer." onRetry={() => setRequest(n => n + 1)}>
      <List label="devices">
        {devices.map((device, i) => {
          const selected = !!device.id && device.id === snapshot.targetId;
          const blocked = !device.id || device.restricted || (device.inApp && snapshot.mode !== 'in-app playback');
          const meta = [device.inApp ? 'this app' : device.type, selected && 'playing here', device.active && !selected && 'active',
            device.restricted && "can't be controlled from here"].filter(Boolean).join(' · ');
          return <Row key={device.id ?? i} index={i} title={device.name} meta={meta} large active={selected} disabled={blocked}
            onClick={() => ctx.action(async () => { await engine.selectDevice(device.id!); setRequest(n => n + 1); })} />;
        })}
      </List>
    </DataView>
    <button type="button" className="text-link more" onClick={() => setRequest(n => n + 1)}>refresh devices</button>
  </>;
}

export function SettingsPage({ ctx, onSignOut }: { ctx: Ctx; onSignOut: () => Promise<void> }) {
  const { snapshot, sync } = ctx;
  return <TextPage onBack={ctx.back} title="settings">
    <Section title="account">
      <p>Signed in to Spotify as {snapshot.account?.name ?? 'your account'}.</p>
      <button type="button" className="text-link" disabled={ctx.busy} onClick={() => ctx.action(onSignOut)}>sign out</button>
    </Section>
    <Section title="library">
      <p>Songs, albums and artists come from the songs you liked and the songs in your playlists.</p>
      {sync.error && <p className="state-title">{sync.error}</p>}
      <button type="button" className="text-link" disabled={sync.syncing} onClick={sync.refresh}>
        {sync.syncing ? 'refreshing…' : 'refresh library'}
      </button>
    </Section>
    <Section title="theme">
      <ThemeSwitch theme={ctx.prefs.theme} accent={ctx.prefs.accent} onTheme={ctx.prefs.setTheme} onAccent={ctx.prefs.setAccent} />
    </Section>
    <Section title="animations">
      <div className="ts-modes" role="group" aria-label="Animations" data-no-swipe>
        {([['on', 'on'], ['off', 'off'], ['system', 'follow windows']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={ctx.prefs.motion === value} onClick={() => ctx.prefs.setMotion(value)}>{label}</button>)}
      </div>
      <p className="page-note">Pivots sliding, pages turning and the full-screen covers flipping.
        "follow windows" turns them off when Windows' Animation effects setting is off.</p>
    </Section>
    <Section title="playback device">
      <PlaybackDevices ctx={ctx} />
    </Section>
    <Section title="diagnostics">
      <p>Webview, DRM and SDK details for troubleshooting playback.</p>
      <button type="button" className="text-link" onClick={() => ctx.open({ kind: 'diagnostics' })}>open diagnostics</button>
    </Section>
  </TextPage>;
}
