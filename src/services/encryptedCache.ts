import { z } from 'zod';
import { secureRecordSchema, type SecureRecord } from '../types/vault';
import { invariant, VaultError } from '../lib/errors';

const CACHE_DB = 'keeva-encrypted-cache-v1';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new VaultError('CACHE_UNAVAILABLE', 'Encrypted browser storage is unavailable.'));
  });
}

export async function readCachedRecord(scope: string, blobId: string): Promise<SecureRecord | undefined> {
  const database = await openDatabase();
  try {
    const result: unknown = await new Promise((resolve, reject) => {
      const request = database.transaction('records').objectStore('records').get(`${scope}:${blobId}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return result === undefined ? undefined : secureRecordSchema.parse(result);
  } finally { database.close(); }
}

export async function cacheRecord(scope: string, blobId: string, record: SecureRecord): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('records', 'readwrite');
      transaction.objectStore('records').put(record, `${scope}:${blobId}`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export function checkContinuity(scope: string, headerId: string, blobIds: string[]): void {
  const key = `keeva.continuity:${scope}`;
  const previous = localStorage.getItem(key);
  if (!previous) return;
  const pinned = z.object({ headerId: z.string(), blobIds: z.array(z.string()) }).parse(JSON.parse(previous));
  invariant(pinned.headerId === headerId, 'HEADER_REPLACED', 'The remote vault header differs from this device’s pinned header.');
  const current = new Set(blobIds);
  invariant(pinned.blobIds.every((id) => current.has(id)), 'HISTORY_MISSING', 'Previously observed vault records are missing. Restore the storage index before continuing.');
}

export function pinContinuity(scope: string, headerId: string, blobIds: string[]): void {
  localStorage.setItem(`keeva.continuity:${scope}`, JSON.stringify({ headerId, blobIds }));
}

export function pinCommittedBlob(scope: string, headerId: string, blobId: string): void {
  const raw = localStorage.getItem(`keeva.continuity:${scope}`);
  const previous = raw ? z.object({ headerId: z.string(), blobIds: z.array(z.string()) }).parse(JSON.parse(raw)) : undefined;
  invariant(!previous || previous.headerId === headerId, 'HEADER_REPLACED', 'The committed header differs from this device’s pinned header.');
  pinContinuity(scope, headerId, [...new Set([...(previous?.blobIds ?? []), blobId])]);
}
