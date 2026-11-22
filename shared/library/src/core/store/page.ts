import type { StoreName } from './db';

/** Read one page of rows, in index order, skipping `offset` rows. */
export function pageByIndex<T>(
  db: IDBDatabase,
  store: StoreName,
  index: string | null,
  direction: IDBCursorDirection,
  offset: number,
  limit: number,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const objectStore = db.transaction(store).objectStore(store);
    const request = (index ? objectStore.index(index) : objectStore).openCursor(null, direction);
    const rows: T[] = [];
    let skipped = offset === 0;
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(rows);
      if (!skipped) {
        skipped = true;
        cursor.advance(offset);
        return;
      }
      rows.push(cursor.value as T);
      if (rows.length >= limit) return resolve(rows);
      cursor.continue();
    };
  });
}

export function allRows<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export function countRows(db: IDBDatabase, store: StoreName): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
