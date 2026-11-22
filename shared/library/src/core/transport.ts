import type { Failure } from './model';

export type Method = 'GET' | 'PUT' | 'POST' | 'DELETE';

/** How the library reaches Spotify: Tauri's `spotify_api` command in the apps, fake data in previews. */
export interface Transport {
  call<T>(path: string, method?: Method, body?: unknown): Promise<T>;
}

/** Seconds from "(retry after 12s)" in a Failure message, as the Rust proxy writes it. */
export function retryAfterSeconds(error: unknown): number | null {
  const failure = error as Failure | undefined;
  if (failure?.status !== 429) return null;
  const match = /retry after (\d+)s/.exec(failure.message ?? '');
  return match ? Number(match[1]) : 2;
}

export interface BackoffOptions {
  retries?: number;
  /** Replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
  maxWaitSeconds?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Wraps a transport so a 429 waits out Retry-After and tries again. */
export function withBackoff(inner: Transport, options: BackoffOptions = {}): Transport {
  const { retries = 4, sleep = defaultSleep, maxWaitSeconds = 60 } = options;
  return {
    async call<T>(path: string, method?: Method, body?: unknown): Promise<T> {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await inner.call<T>(path, method, body);
        } catch (error) {
          const wait = retryAfterSeconds(error);
          if (wait === null || attempt >= retries) throw error;
          await sleep(Math.min(wait, maxWaitSeconds) * 1000);
        }
      }
    },
  };
}
