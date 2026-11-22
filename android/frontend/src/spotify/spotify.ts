// Spotify for the Android app (A4): the Rust commands in ../../../app/src-tauri/src/auth.rs.
// Only used inside the Tauri app; the mock and the review page keep the fake library.
import { invoke } from '@tauri-apps/api/core';

/** What a failed command returns (same shape as on Windows). */
export interface Failure { status?: number | null; message: string; endpoint?: string | null; reauthenticate: boolean }
export interface Account { id: string; name: string; premium: boolean }

export function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as Failure).message);
  return 'Something went wrong.';
}

export const spotify = {
  settings: () => invoke<{ clientId: string; redirectUri: string }>('auth_settings'),
  restore: () => invoke<boolean>('auth_restore'),
  clientId: () => invoke<string | null>('auth_client_id'),
  signIn: (clientId: string) => invoke<void>('auth_login', { clientId }),
  signOut: () => invoke<void>('auth_logout'),
  api: <T>(path: string, method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET', body?: unknown) =>
    invoke<T>('spotify_api', { path, method, body: body ?? null }),
  async me(): Promise<Account> {
    const me = await spotify.api<{ id: string; display_name?: string | null; product?: string }>('/me');
    return { id: me.id, name: me.display_name || me.id, premium: me.product === 'premium' };
  },
};
