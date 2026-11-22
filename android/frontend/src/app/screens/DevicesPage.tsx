import { useEffect, useState } from 'react';
import { fetchDevices, messageOf, transferTo, type Device } from '@zplayer/library';
import { useLibraryContext } from '@zplayer/library/react';
import { List, Row, TextPage, type DataState } from '@zplayer/theme';
import { Data, type Ctx } from './common';

/** Spotify Connect devices signed in to your account. This phone's Spotify app shows up once it has played. */
export function DevicesPage({ ctx }: { ctx: Ctx }) {
  const { library, transport } = useLibraryContext();
  const [devices, setDevices] = useState<Device[]>([]);
  const [state, setState] = useState<DataState>('loading');
  const [request, setRequest] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!library) return;
    let live = true;
    setState('loading');
    void fetchDevices(transport).then(list => {
      if (!live) return;
      const usable = list.filter(device => device.id);
      setDevices(usable);
      setState(usable.length ? 'normal' : 'empty');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [library, transport, request]);

  const pick = (device: Device) => {
    if (device.restricted || device.active || !device.id) return;
    setMoving(device.id);
    setError(null);
    transferTo(transport, device.id, true).then(
      () => { setMoving(null); setRequest(n => n + 1); },
      failure => { setMoving(null); setError(messageOf(failure)); });
  };

  return <TextPage onBack={ctx.back} kicker="play on" title="devices">
    <p className="page-note">Spotify Connect devices signed in to your account. This phone's Spotify app shows up here once it has played.</p>
    <Data state={state} empty="no devices right now. play a song to wake this phone's spotify app." onRetry={() => setRequest(n => n + 1)}>
      <List label="devices">
        {devices.map((device, i) => <Row key={device.id!} index={i} title={device.name.toLowerCase()} large active={device.active}
          disabled={device.restricted}
          meta={device.restricted ? `${device.type.toLowerCase()} · can't be controlled from here`
            : moving === device.id ? `${device.type.toLowerCase()} · moving playback here…`
            : device.active ? `${device.type.toLowerCase()} · playing here` : device.type.toLowerCase()}
          onClick={() => pick(device)} />)}
      </List>
    </Data>
    {error && <p className="zp-error" role="alert">{error}</p>}
  </TextPage>;
}

