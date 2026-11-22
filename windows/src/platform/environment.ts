import { invoke } from '@tauri-apps/api/core';
import { messageOf } from '@zplayer/library';

interface OriginProbe {
  origin: string;
  secureContext: boolean;
  eme: boolean;
}
export interface Environment {
  initial: OriginProbe;
  current: OriginProbe;
  userAgent: string;
  originNote?: string;
}

function probeOrigin(): OriginProbe {
  return {
    origin: window.location.origin === 'null'
      ? `${window.location.protocol}//${window.location.host}`
      : window.location.origin,
    secureContext: window.isSecureContext,
    eme: typeof navigator.requestMediaKeySystemAccess === 'function',
  };
}

export async function environment(): Promise<Environment | undefined> {
  const current = probeOrigin();
  const result: Environment = { initial: current, current, userAgent: navigator.userAgent };
  if (window.location.origin === 'http://127.0.0.1:17653') {
    const query = new URLSearchParams(window.location.search);
    const first = query.get('initial');
    if (first) {
      try { result.initial = JSON.parse(first) as OriginProbe; } catch { /* Use the live values. */ }
    }
    result.originNote = query.get('comparison') === '1'
      ? 'Loopback comparison requested with ZPLAYER_FORCE_LOOPBACK.'
      : 'Switched to loopback because the default origin lacked a secure context or the standard EME API.';
    return result;
  }
  const needed = !current.secureContext || !current.eme;
  try {
    const url = await invoke<string | null>('loopback_bootstrap', { needed });
    if (url) {
      const target = new URL(url);
      target.searchParams.set('initial', JSON.stringify(current));
      if (!needed) target.searchParams.set('comparison', '1');
      window.location.replace(target.toString());
      return;
    }
  } catch (error) {
    result.originNote = `Could not prepare the loopback frontend · ${messageOf(error)}. Using the current origin.`;
  }
  return result;
}

export async function probeDrm() {
  const config = (initDataTypes: string[], contentType = 'audio/mp4; codecs="mp4a.40.2"'): MediaKeySystemConfiguration => ({
    initDataTypes, audioCapabilities: [{ contentType }],
  });
  async function check(names: string[], configs: MediaKeySystemConfiguration[]) {
    if (!navigator.requestMediaKeySystemAccess) return 'standard EME API missing';
    const attempts = names.map(async name => {
      await navigator.requestMediaKeySystemAccess(name, configs);
      return `yes · ${name}`;
    });
    let timer: number | undefined;
    try {
      return await Promise.race([
        Promise.any(attempts).catch(() => 'no for the tested audio configurations'),
        new Promise<string>(resolve => { timer = window.setTimeout(() => resolve('probe timed out'), 5_000); }),
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }
  const [widevine, modernFairPlay, playReady] = await Promise.all([
    check(['com.widevine.alpha'], [config(['cenc']), config(['webm'], 'audio/webm; codecs="opus"')]),
    check(['com.apple.fps'], [config(['sinf']), config(['skd']), config(['cenc'])]),
    check(['com.microsoft.playready', 'com.microsoft.playready.recommendation'], [config(['cenc'])]),
  ]);
  let fairPlay = modernFairPlay;
  if (!fairPlay.startsWith('yes')) {
    const webKit = window as Window & { WebKitMediaKeys?: { isTypeSupported(id: string, mime: string): boolean } };
    try {
      if (webKit.WebKitMediaKeys?.isTypeSupported('com.apple.fps.1_0', 'video/mp4')) {
        fairPlay = 'yes · legacy WebKit API';
      }
    } catch { /* Keep the standard probe result. */ }
  }
  return { Widevine: widevine, FairPlay: fairPlay, PlayReady: playReady };
}
