import type { Account } from '../model';
import type { Transport } from '../transport';

/** Scopes the library needs; the Rust side requests them (scopes.rs). */
export const REQUIRED_SCOPES = [
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
  'user-read-playback-state',
  'user-modify-playback-state',
] as const;

export async function fetchAccount(transport: Transport): Promise<Account> {
  const me = await transport.call<{ id: string; display_name?: string | null }>('/me');
  return { id: me.id, name: me.display_name || me.id };
}

/** Scopes missing from the granted list, so the app can ask the user to connect again. */
export function missingScopes(granted: readonly string[], required: readonly string[] = REQUIRED_SCOPES): string[] {
  return required.filter((scope) => !granted.includes(scope));
}
