import { useSyncExternalStore } from 'react';

export type SavedItem = {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  vote_average: number;
  date: string;
  added: number;
};

const KEY = 'crdb-watchlist-v1';
const listeners = new Set<() => void>();
let cache: SavedItem[] | null = null;

function read(): SavedItem[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: SavedItem[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* التخزين ممنوع أو ممتلئ */
  }
  listeners.forEach(l => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, read, read);
  const has = (id: number, type: 'movie' | 'tv') => items.some(i => i.id === id && i.media_type === type);
  const toggle = (item: Omit<SavedItem, 'added'>) => {
    const current = read();
    if (current.some(i => i.id === item.id && i.media_type === item.media_type)) {
      write(current.filter(i => !(i.id === item.id && i.media_type === item.media_type)));
    } else {
      write([{ ...item, added: Date.now() }, ...current]);
    }
  };
  return { items, has, toggle };
}
