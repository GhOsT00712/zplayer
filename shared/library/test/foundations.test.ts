import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { STORES, clearLibrary, done, getMeta, openLibraryDb, setMeta, withBackoff, type Transport } from '../src/core';

describe('withBackoff', () => {
  it('waits out a 429 and retries', async () => {
    let calls = 0;
    const waits: number[] = [];
    const inner: Transport = {
      async call<T>() {
        calls += 1;
        if (calls < 3) throw { status: 429, message: 'Too many (retry after 3s)' };
        return 'ok' as T;
      },
    };
    const transport = withBackoff(inner, { sleep: async (ms) => void waits.push(ms) });
    expect(await transport.call<string>('/me')).toBe('ok');
    expect(waits).toEqual([3000, 3000]);
  });

  it('does not retry other errors, and gives up after the retry limit', async () => {
    let calls = 0;
    const fail = (status: number): Transport => ({
      async call() {
        calls += 1;
        throw { status, message: 'x' };
      },
    });
    await expect(withBackoff(fail(500)).call('/x')).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(1);
    calls = 0;
    await expect(withBackoff(fail(429), { retries: 2, sleep: async () => {} }).call('/x')).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(3);
  });
});

describe('library db', () => {
  it('creates every store and keeps meta values', async () => {
    const db = await openLibraryDb('test-1');
    expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
    await setMeta(db, 'k', { a: 1 });
    expect(await getMeta(db, 'k')).toEqual({ a: 1 });
    db.close();
  });

  it('clears all stores', async () => {
    const db = await openLibraryDb('test-2');
    const tx = db.transaction(STORES.history, 'readwrite');
    await done(tx.objectStore(STORES.history).add({ playedAt: 1, song: { id: 'a' } }));
    await setMeta(db, 'k', 1);
    await clearLibrary(db);
    expect(await done(db.transaction(STORES.history).objectStore(STORES.history).count())).toBe(0);
    expect(await getMeta(db, 'k')).toBeUndefined();
    db.close();
  });
});
