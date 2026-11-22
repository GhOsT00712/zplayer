import { useEffect, useState } from 'react';
import { Section, TextPage } from '@zplayer/theme';
import { probeDrm, type Environment } from '../../platform/environment';
import type { EngineSnapshot } from '../../playback/sdkEngine';

export function DiagnosticsPage({ snapshot, environment, onBack }: { snapshot: EngineSnapshot; environment: Environment; onBack: () => void }) {
  const [drm, setDrm] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void probeDrm().then(value => { if (live) setDrm(value); });
    return () => { live = false; };
  }, []);
  const rows: [string, string][] = [
    ['mode', snapshot.mode],
    ['signed in as', snapshot.account ? `${snapshot.account.name} (${snapshot.account.id})` : '—'],
    ['SDK ready fired', String(snapshot.sdkReady)],
    ['SDK device id', snapshot.sdkDeviceId ?? '—'],
    ['active target', [snapshot.targetName, snapshot.targetId].filter(Boolean).join(' · ') || '—'],
    ['default origin', environment.initial.origin],
    ['default secure context', String(environment.initial.secureContext)],
    ['default standard EME API', String(environment.initial.eme)],
    ['current origin', environment.current.origin],
    ['current secure context', String(environment.current.secureContext)],
    ['current standard EME API', String(environment.current.eme)],
    ...['Widevine', 'PlayReady', 'FairPlay'].map(key => [key, drm[key] ?? 'checking…'] as [string, string]),
    ['user agent', environment.userAgent],
  ];
  return <TextPage onBack={onBack} kicker="settings" title="diagnostics">
    {environment.originNote && <p className="page-note">{environment.originNote}</p>}
    {snapshot.reason && <p className="page-note">{snapshot.reason}</p>}
    <Section title="environment">
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Section>
    <Section title="event log">
      <pre className="log">{snapshot.log.join('\n') || 'no events yet'}</pre>
    </Section>
  </TextPage>;
}
