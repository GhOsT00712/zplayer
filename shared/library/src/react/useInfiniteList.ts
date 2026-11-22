import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPager } from '../core/paging';
import type { Page } from '../core/model';

export interface InfiniteList<T> {
  items: T[];
  loading: boolean;
  done: boolean;
  error?: unknown;
  /** Put this ref on an element after the last row; the next page loads when it nears the screen. */
  sentinelRef: (node: Element | null) => void;
  /** Re-read from the start, keeping the rows already shown. */
  refresh: () => void;
  /** Try the failed page again. */
  retry: () => void;
}

/**
 * Shared infinite scrolling. Each app decides where the sentinel sits and how loading looks.
 * `deps` restart the list (a new query or section); `reloadOn` re-reads it quietly (sync progress).
 */
export function useInfiniteList<T>(
  load: (offset: number) => Promise<Page<T>>,
  deps: readonly unknown[],
  reloadOn?: (listener: () => void) => () => void,
  enabled = true,
): InfiniteList<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [pager, setPager] = useState(() => createPager<T>((offset) => loadRef.current(offset)));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next = createPager<T>((offset) => loadRef.current(offset));
    setPager(next);
    if (enabled) void next.reset();
  }, [...deps, enabled]);

  useEffect(() => {
    if (!reloadOn || !enabled) return;
    return reloadOn(() => void pager.refresh());
  }, [pager, reloadOn, enabled]);

  const state = useSyncExternalStore(pager.subscribe, pager.get);

  const node = useRef<Element | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const attach = useCallback(() => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node.current || typeof IntersectionObserver === 'undefined') return;
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void pager.loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.current.observe(node.current);
  }, [pager]);
  const sentinelRef = useCallback(
    (element: Element | null) => {
      node.current = element;
      attach();
    },
    [attach],
  );

  // An observer only reports changes, so a sentinel that is still on screen after a page arrived
  // (a short list on a tall screen) needs a fresh observer to ask for the next page.
  useEffect(() => {
    if (!state.loading && !state.done && !state.error) attach();
  }, [state.items.length, state.loading, state.done, state.error, attach]);

  useEffect(() => () => observer.current?.disconnect(), []);

  return {
    items: state.items,
    loading: state.loading,
    done: state.done,
    error: state.error,
    sentinelRef,
    refresh: () => void pager.refresh(),
    retry: () => void pager.loadMore(),
  };
}
