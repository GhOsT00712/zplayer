import { useState } from 'react';
import { useSearch } from '@zplayer/library/react';
import { Hub, SearchBox, type PivotItem } from '@zplayer/theme';
import { Infinite, SongRows, type Ctx } from './common';

function Results({ ctx, query }: { ctx: Ctx; query: string }) {
  const list = useSearch(query);
  const text = query.trim();
  if (!text) return <p className="empty">search songs on Spotify</p>;
  return <Infinite list={list} label="search results" empty={`no songs match "${text}"`}>
    {songs => <SongRows ctx={ctx} songs={songs} />}
  </Infinite>;
}

/** Spotify song search: 10 results per request, the next page loads on scroll. */
export function SearchHub({ ctx }: { ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const pivots: PivotItem[] = [{ id: 'songs', label: 'songs', render: () => <Results ctx={ctx} query={query} /> }];
  return <Hub title="search" items={pivots} inputEnabled={ctx.inputEnabled} onBack={ctx.back}
    subheader={<SearchBox value={query} onChange={setQuery} autoFocus />} />;
}
