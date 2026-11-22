import type { Page } from './model';

export interface PagerState<T> {
  items: T[];
  loading: boolean;
  /** No more pages. */
  done: boolean;
  error?: unknown;
}

/**
 * Infinite-list state without React: loads a page at a time, never two at once, and can reload while
 * keeping as many rows as were already on screen (so a sync refresh does not jump the scroll position).
 */
export function createPager<T>(load: (offset: number) => Promise<Page<T>>) {
  let state: PagerState<T> = { items: [], loading: false, done: false };
  let next: number | null = 0;
  let generation = 0;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PagerState<T>>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function loadMore() {
    if (state.loading || next === null) return;
    const mine = generation;
    set({ loading: true, error: undefined });
    try {
      const page = await load(next);
      if (mine !== generation) return;
      next = page.next;
      set({ items: [...state.items, ...page.items], loading: false, done: page.next === null });
    } catch (error) {
      if (mine === generation) set({ loading: false, error });
    }
  }

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    loadMore,
    /** Forget everything and start from the first page (the query or section changed). */
    reset() {
      generation += 1;
      next = 0;
      state = { items: [], loading: false, done: false };
      listeners.forEach((listener) => listener());
      return loadMore();
    },
    /** Re-read from the start, up to the number of rows already shown. */
    async refresh() {
      const wanted = state.items.length;
      const mine = (generation += 1);
      const items: T[] = [];
      let offset: number | null = 0;
      set({ loading: true, error: undefined });
      try {
        do {
          const page: Page<T> = await load(offset);
          if (mine !== generation) return;
          items.push(...page.items);
          offset = page.next;
        } while (offset !== null && items.length < wanted);
        next = offset;
        set({ items, loading: false, done: offset === null });
      } catch (error) {
        if (mine === generation) set({ loading: false, error });
      }
    },
  };
}

export type Pager<T> = ReturnType<typeof createPager<T>>;
