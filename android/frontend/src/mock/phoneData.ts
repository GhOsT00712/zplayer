// Android-only fake data. The library itself comes from ../shared/data.ts (the design mock's).

/** On Android, sound comes from the Spotify app (App Remote), so "this phone" is the Spotify app. */
export interface PhoneDevice { id: string; name: string; type: string; local: boolean; restricted: boolean }
export const phoneDevices: PhoneDevice[] = [
  { id: 'this-phone', name: 'This phone', type: 'spotify app', local: true, restricted: false },
  { id: 'speaker', name: 'Living room speaker', type: 'speaker', local: false, restricted: false },
  { id: 'laptop', name: 'Work laptop', type: 'computer', local: false, restricted: false },
  { id: 'tv', name: 'Bedroom TV', type: 'tv', local: false, restricted: true },
];

export const modeLabel = (device: PhoneDevice) =>
  device.local ? 'spotify app · this phone' : `remote control · ${device.name.toLowerCase()}`;

/** Sample values for the diagnostics page. */
export const diagnostics: [string, string][] = [
  ['mode', 'App Remote · Spotify app on this phone'],
  ['Spotify app', 'installed · 9.0.x · signed in'],
  ['App Remote', 'connected'],
  ['account', 'Premium · on-demand play allowed'],
  ['Android', '15 (API 35)'],
  ['WebView', 'Android System WebView 142'],
  ['insets', 'status 32 dp · gesture 22 dp'],
  ['origin', 'http://tauri.localhost'],
];
