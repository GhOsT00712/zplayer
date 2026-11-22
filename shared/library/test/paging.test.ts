import { describe, expect, it } from 'vitest';
import { createPager } from '../src/core';

const source = (n: number, size = 10) => async (offset: number) => ({
  items: Array.from({ length: Math.min(size, n - offset) }, (_, i) => offset + i),
  next: offset + size < n ? offset + size : null,
});

describe('createPager', () => {
  it('loads page by page and stops at the end', async () => {
    const pager = createPager(source(25));
    await pager.loadMore();
    await pager.loadMore();
    await pager.loadMore();
    await pager.loadMore();
    expect(pager.get().items).toHaveLength(25);
    expect(pager.get().done).toBe(true);
  });

  it('never loads two pages at once', async () => {
    let calls = 0;
    const pager = createPager(async (offset) => {
      calls += 1;
      return source(30)(offset);
    });
    await Promise.all([pager.loadMore(), pager.loadMore(), pager.loadMore()]);
    expect(calls).toBe(1);
  });

  it('refresh keeps as many rows as were shown; reset starts over and drops stale loads', async () => {
    let total = 25;
    const pager = createPager((offset) => source(total)(offset));
    await pager.loadMore();
    await pager.loadMore();
    total = 40;
    await pager.refresh();
    expect(pager.get().items).toHaveLength(20);
    expect(pager.get().done).toBe(false);

    const releases: (() => void)[] = [];
    const slow = createPager(async (offset) => {
      await new Promise<void>((r) => releases.push(r));
      return source(5)(offset);
    });
    const stale = slow.loadMore();
    const fresh = slow.reset();
    releases.forEach((release) => release());
    await Promise.all([stale, fresh]);
    expect(slow.get().items).toHaveLength(5);
  });

  it('keeps rows and reports the error when a page fails, then retries', async () => {
    let fail = false;
    const pager = createPager(async (offset) => {
      if (fail) throw new Error('boom');
      return source(30)(offset);
    });
    await pager.loadMore();
    fail = true;
    await pager.loadMore();
    expect(pager.get().items).toHaveLength(10);
    expect(pager.get().error).toBeInstanceOf(Error);
    fail = false;
    await pager.loadMore();
    expect(pager.get().items).toHaveLength(20);
    expect(pager.get().error).toBeUndefined();
  });
});
