// Spotify for the Android app: the Rust commands in ../../../app/src-tauri/src/auth.rs, as the
// library's transport and the provider's sign-in port. Only used inside the Tauri app; the browser
// preview uses ../mock/fakeSpotify.ts instead.
import { invoke } from '@tauri-apps/api/core';
import { withBackoff, type Method, type Transport } from '@zplayer/library';
import type { AuthPort } from '@zplayer/library/react';

export const tauriTransport: Transport = withBackoff({
  call: <T>(path: string, method: Method = 'GET', body?: unknown) =>
    invoke<T>('spotify_api', { path, method, body: body ?? null }),
});

export const tauriAuth: AuthPort & { clientId: () => Promise<string | null> } = {
  settings: () => invoke('auth_settings'),
  restore: () => invoke<boolean>('auth_restore'),
  signIn: clientId => invoke<void>('auth_login', { clientId }),
  signOut: () => invoke<void>('auth_logout'),
  scopes: () => invoke<string[]>('auth_scopes'),
  clientId: () => invoke<string | null>('auth_client_id'),
};
