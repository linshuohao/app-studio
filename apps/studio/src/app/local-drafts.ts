export type SaveRequest = {
  key: string;
  text: string;
  basedOnVersionId: string | null;
  note: string;
  name?: string;
};
export type DraftContent = {
  agentApplied?: boolean;
  text: string;
  note: string;
  versionId: string | null;
  savedText: string;
  pending: SaveRequest | null;
};
export type LocalDraft = DraftContent & {
  id: string;
  userId: string;
  spaceId: string;
  formId: string;
  updated: number;
};
type Owner = Pick<LocalDraft, 'userId' | 'spaceId' | 'formId'>;
const week = 7 * 24 * 60 * 60 * 1000;
const database = 'studio-local-drafts';
let opening: Promise<IDBDatabase> | undefined;
function open() {
  if (!opening)
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(database, 2);
      let blocked = false;
      req.onblocked = () => {
        blocked = true;
        reject(Error('请关闭占用旧版本地草稿库的页面。'));
      };
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('drafts')) {
          const drafts = req.result.createObjectStore('drafts', { keyPath: 'id' });
          drafts.createIndex('owner', ['userId', 'spaceId', 'formId']);
          drafts.createIndex('user', 'userId');
          req.result.createObjectStore('epochs');
        }
        req.transaction!.objectStore('drafts').createIndex('updated', 'updated');
      };
      req.onsuccess = () => {
        const db = req.result;
        if (blocked) {
          db.close();
          opening = undefined;
          return;
        }
        db.onversionchange = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
      req.onerror = () => {
        opening = undefined;
        reject(req.error);
      };
    });
  return opening;
}
async function transaction<T>(work: (tx: IDBTransaction, done: (v: T) => void) => void) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(['drafts', 'epochs'], 'readwrite');
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? Error('本机存储不可用'));
    work(tx, (value) => {
      result = value;
    });
  });
}
export function clearAccountDrafts(userId: string) {
  return transaction<void>((tx, done) => {
    tx.objectStore('epochs').put(crypto.randomUUID(), userId);
    const store = tx.objectStore('drafts');
    const cursor = store.index('user').openKeyCursor(userId);
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (row) {
        store.delete(row.primaryKey);
        row.continue();
      }
    };
    done();
  });
}
export function updateDrafts(
  owner: Owner,
  epoch?: string,
  change?: (rows: Map<string, LocalDraft>) => void,
) {
  return transaction<{ epoch: string; rows: LocalDraft[] }>((tx, done) => {
    const request = tx.objectStore('epochs').get(owner.userId);
    request.onsuccess = () => {
      const current: string = request.result ?? '';
      if (epoch !== undefined && current !== epoch) {
        tx.abort();
        return;
      }
      const store = tx.objectStore('drafts');
      if (epoch === undefined) {
        const expired = store
          .index('updated')
          .openCursor(IDBKeyRange.upperBound(Date.now() - week));
        expired.onsuccess = () => {
          const cursor = expired.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      }

      const read = store.index('owner').getAll([owner.userId, owner.spaceId, owner.formId]);
      read.onsuccess = () => {
        const previous = read.result as LocalDraft[];
        const byId = new Map(
          previous.filter((row) => row.updated > Date.now() - week).map((row) => [row.id, row]),
        );
        try {
          change?.(byId);
        } catch {
          tx.abort();
          return;
        }
        const rows = [...byId.values()]
          .sort((a, b) => b.updated - a.updated || b.id.localeCompare(a.id))
          .slice(0, 3);
        for (const row of previous)
          if (!rows.some((item) => item.id === row.id)) store.delete(row.id);
        for (const row of rows) if (!previous.includes(row)) store.put(row);
        done({ rows, epoch: current });
      };
    };
  });
}
