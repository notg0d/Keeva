import type { MemWal, MemorySummary } from '@mysten-incubation/memwal';
import { parseSerializedSignature } from '@mysten/sui/cryptography';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { z } from 'zod';
import type { VaultConfig } from '../config/vaultConfig';
import { createKdf, decryptJson, deriveMasterKey, encryptJson, type KdfParameters } from '../crypto/vaultCrypto';
import { fromBase64, utf8 } from '../lib/encoding';
import { invariant } from '../lib/errors';
import { auditEventSchema, credentialInputSchema, recordBodySchema, secureRecordSchema, vaultHeaderSchema,
  type CredentialInput, type RecordBody, type SecureRecord, type VaultHeader, type VaultSnapshot, type BlobEntry } from '../types/vault';
import { cacheRecord, checkContinuity, pinCommittedBlob, pinContinuity, readCachedRecord } from './encryptedCache';
import { assertRelayerMainnet, createMemwal, verifyDelegate } from './memwalGateway';
import { projectVault } from './vaultProjection';
import { TatumSuiClient } from './tatumSuiClient';

export type WalletSigner = (message: Uint8Array<ArrayBuffer>) => Promise<{ signature: string }>;
export type UnlockMaterial = { method: 'passphrase'; passphrase: string } | { method: 'wallet' };
const pendingSchema = z.object({ namespace: z.string(), id: z.uuid(), text: z.string().max(100_000) });
const DISCOVERY_QUERY = 'Keeva encrypted vault record';

export class VaultStorageService {
  readonly memwal: MemWal;
  readonly rpc: TatumSuiClient;
  private key?: CryptoKey;
  private header?: VaultHeader;
  private headerBlobId?: string;
  private closed = false;
  private writing = false;
  private syncing?: Promise<VaultSnapshot>;
  private readonly scope: string;
  private readonly prefix: string;

  constructor(readonly config: VaultConfig, readonly wallet: string) {
    this.memwal = createMemwal(config);
    this.rpc = new TatumSuiClient(config.tatumApiKey);
    this.scope = `${config.memwalAccountId.toLowerCase()}:${config.memwalNamespace}`;
    this.prefix = `${config.memwalNamespace}.r.`;
  }

  private active(): void { invariant(!this.closed, 'VAULT_LOCKED', 'The vault is locked. Unlock to continue.'); }
  private unlocked(): CryptoKey {
    this.active();
    invariant(this.key && this.header && this.headerBlobId, 'VAULT_LOCKED', 'Unlock the vault before accessing credentials.');
    return this.key;
  }
  lock(): void { this.closed = true; this.key = undefined; this.header = undefined; this.memwal.destroy(); }
  hasPendingWrite(): boolean { return localStorage.getItem(`keeva.pending:${this.scope}`) !== null; }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    this.active();
    invariant(!this.writing, 'WRITE_RUNNING', 'A vault write is already running.');
    invariant(navigator.locks, 'WEB_LOCKS_REQUIRED', 'This browser must support secure Web Locks for vault writes.');
    this.writing = true;
    try {
      return await navigator.locks.request(`keeva-write:${this.scope}`, { ifAvailable: true }, async (lock) => {
        invariant(lock, 'OTHER_TAB_WRITING', 'Another tab is writing to this vault. Wait for that operation to finish.');
        this.active();
        return operation();
      });
    } finally { this.writing = false; }
  }

  private async authorize(): Promise<void> {
    await Promise.all([assertRelayerMainnet(this.config), this.rpc.assertMainnet(), verifyDelegate(this.config, this.memwal, this.wallet)]);
    this.active();
  }

  private async inventory(): Promise<MemorySummary[]> {
    const records = new Map<string, MemorySummary>();
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      this.active();
      const page = await this.memwal.listMemories({ cursor, limit: 500 });
      this.active();
      invariant(!page.must_resync, 'INDEX_CHANGED', 'The storage index changed during synchronization. Retry synchronization.');
      for (const item of page.memories) {
        if (item.namespace_id !== this.config.memwalNamespace && !item.namespace_id.startsWith(this.prefix)) continue;
        invariant(/^[A-Za-z0-9_-]{43}$/.test(item.blob_id), 'BLOB_ID', 'The relayer returned an invalid Walrus blob identifier.');
        records.set(item.memory_id, item);
      }
      for (const deleted of page.deleted) records.delete(deleted.memory_id);
      if (!page.has_more) break;
      invariant(page.next_cursor && !seen.has(page.next_cursor), 'PAGINATION', 'The relayer returned a non-advancing inventory cursor.');
      seen.add(page.next_cursor);
      cursor = page.next_cursor;
    }
    return [...records.values()];
  }

  private async recallExact(namespace: string, blobId: string): Promise<string> {
    const result = await this.memwal.recall({ query: DISCOVERY_QUERY, topK: 15, namespace });
    this.active();
    invariant(!result.dropped_count, 'RECALL_INCOMPLETE', 'Walrus could not retrieve all requested encrypted records.');
    const matches = result.results.filter((record) => record.blob_id === blobId);
    invariant(matches.length === 1, 'BLOB_UNAVAILABLE', 'An indexed vault blob could not be retrieved. Restore the index or check storage availability.');
    return matches[0]!.text;
  }

  async inspect(): Promise<VaultHeader | null> {
    await this.authorize();
    const inventory = await this.inventory();
    const headers = inventory.filter((item) => item.namespace_id === this.config.memwalNamespace);
    invariant(headers.length <= 1, 'HEADER_CONFLICT', 'This namespace contains multiple vault headers. Resolve the storage conflict before unlocking.');
    if (!headers.length) {
      invariant(inventory.length === 0, 'HEADER_MISSING', 'The vault header is missing while encrypted records remain. Restore the index.');
      return null;
    }
    const item = headers[0]!;
    const header = vaultHeaderSchema.parse(JSON.parse(await this.recallExact(item.namespace_id, item.blob_id)));
    invariant(header.accountId === this.config.memwalAccountId.toLowerCase() && header.namespace === this.config.memwalNamespace &&
      header.wallet === this.wallet.toLowerCase(), 'HEADER_SCOPE', 'The vault header is bound to a different account, namespace, or wallet.');
    checkContinuity(this.scope, item.blob_id, inventory.map((row) => row.blob_id));
    this.headerBlobId = item.blob_id;
    this.header = header;
    return header;
  }

  private headerContext(header: Omit<VaultHeader, 'check'>): string {
    return JSON.stringify(['keeva:header:v1', header.vaultId, header.accountId, header.namespace, header.wallet,
      header.kdf.algorithm, header.kdf.method, header.kdf.iterations, header.kdf.salt]);
  }

  private async derive(material: UnlockMaterial, header: Omit<VaultHeader, 'check'>, sign: WalletSigner): Promise<CryptoKey> {
    invariant(material.method === header.kdf.method, 'UNLOCK_METHOD', 'Use the unlock method selected when this vault was created.');
    let bytes: Uint8Array<ArrayBuffer>;
    if (material.method === 'passphrase') {
      const message = utf8.encode(`Keeva wallet authorization\nAccount: ${header.accountId}\nNamespace: ${header.namespace}\nChallenge: ${crypto.randomUUID()}`);
      const { signature } = await sign(message);
      await verifyPersonalMessageSignature(message, signature, { address: this.wallet, client: this.rpc.sdk });
      bytes = utf8.encode(material.passphrase);
    } else {
      const message = utf8.encode(`Keeva private vault key derivation v1\n${this.headerContext(header)}\nKeep this signature private. It unlocks this vault.`);
      const { signature } = await sign(message);
      await verifyPersonalMessageSignature(message, signature, { address: this.wallet, client: this.rpc.sdk });
      invariant(parseSerializedSignature(signature).signatureScheme === 'ED25519', 'WALLET_SCHEME',
        'Wallet-derived vault keys require deterministic Ed25519 signatures. Use a passphrase with this wallet.');
      bytes = fromBase64(signature);
    }
    try {
      const key = await deriveMasterKey(bytes, header.kdf);
      this.active();
      return key;
    } finally { bytes.fill(0); }
  }

  async initialize(material: UnlockMaterial, sign: WalletSigner): Promise<VaultSnapshot> {
    return this.withWriteLock(() => this.initializeInner(material, sign));
  }

  private async initializeInner(material: UnlockMaterial, sign: WalletSigner): Promise<VaultSnapshot> {
    invariant(await this.inspect() === null, 'VAULT_EXISTS', 'A vault already exists in this namespace. Unlock it to continue.');
    if (material.method === 'passphrase') invariant(material.passphrase.length >= 14, 'PASSPHRASE_SHORT', 'Use a master passphrase of at least 14 characters.');
    const pending = this.readPending();
    let header: VaultHeader;
    let key: CryptoKey;
    if (pending) {
      invariant(pending.namespace === this.config.memwalNamespace, 'PENDING_WRITE', 'Restore the existing vault before retrying the pending write.');
      header = vaultHeaderSchema.parse(JSON.parse(pending.text));
      key = await this.derive(material, header, sign);
      await this.checkKey(key, header);
    } else {
      const base = { format: 'keeva.header.v1' as const, vaultId: crypto.randomUUID(),
        accountId: this.config.memwalAccountId.toLowerCase(), namespace: this.config.memwalNamespace,
        wallet: this.wallet.toLowerCase(), kdf: createKdf(material.method) };
      key = await this.derive(material, base, sign);
      header = { ...base, check: await encryptJson(key, { vaultId: base.vaultId, purpose: 'keeva-key-check-v1' }, this.headerContext(base)) };
      this.savePending(base.namespace, base.vaultId, header);
    }
    const result = await this.commitPending();
    this.header = header; this.headerBlobId = result.blob_id; this.key = key;
    pinCommittedBlob(this.scope, result.blob_id, result.blob_id);
    this.clearPending();
    return this.synchronize();
  }

  private async checkKey(key: CryptoKey, header: VaultHeader): Promise<void> {
    const check = z.object({ vaultId: z.uuid(), purpose: z.literal('keeva-key-check-v1') })
      .parse(await decryptJson(key, header.check, this.headerContext(header)));
    invariant(check.vaultId === header.vaultId, 'KEY_CHECK', 'Vault key authentication failed.');
  }

  async unlock(material: UnlockMaterial, sign: WalletSigner): Promise<VaultSnapshot> {
    const header = await this.inspect();
    invariant(header, 'VAULT_NOT_FOUND', 'No vault header is indexed in this namespace. Initialize a vault or restore its index.');
    const key = await this.derive(material, header, sign);
    await this.checkKey(key, header);
    this.active(); this.key = key;
    return this.synchronize();
  }

  synchronize(): Promise<VaultSnapshot> {
    this.unlocked();
    if (this.syncing) return this.syncing;
    const pending = this.synchronizeInner();
    this.syncing = pending;
    void pending.finally(() => { if (this.syncing === pending) this.syncing = undefined; }).catch(() => {});
    return pending;
  }

  private async synchronizeInner(): Promise<VaultSnapshot> {
    const key = this.unlocked();
    const header = this.header!;
    const inventory = await this.inventory();
    invariant(inventory.filter((item) => item.namespace_id === this.config.memwalNamespace).length === 1,
      'HEADER_CONFLICT', 'The vault must have exactly one header.');
    invariant(inventory.some((item) => item.blob_id === this.headerBlobId && item.namespace_id === this.config.memwalNamespace),
      'HEADER_REPLACED', 'The vault header changed during this session.');
    checkContinuity(this.scope, this.headerBlobId!, inventory.map((item) => item.blob_id));
    const namespaces = new Set<string>();
    const records: Parameters<typeof projectVault>[0] = [];
    const blobs: BlobEntry[] = inventory.map((item) => ({ blobId: item.blob_id, namespace: item.namespace_id,
      createdAt: item.created_at, size: item.size, expiresAt: item.expires_at,
      endEpoch: item.end_epoch, status: item.status }));
    for (const item of inventory) {
      this.active();
      if (item.namespace_id === this.config.memwalNamespace) continue;
      invariant(!namespaces.has(item.namespace_id), 'RECORD_CONFLICT', 'An immutable record namespace contains multiple blobs.');
      namespaces.add(item.namespace_id);
      const recordId = z.uuid().parse(item.namespace_id.slice(this.prefix.length));
      let envelope = await readCachedRecord(this.scope, item.blob_id);
      if (!envelope) envelope = secureRecordSchema.parse(JSON.parse(await this.recallExact(item.namespace_id, item.blob_id)));
      invariant(envelope.vaultId === header.vaultId && envelope.recordId === recordId, 'RECORD_SCOPE', 'Encrypted record scope does not match its storage location.');
      const body = recordBodySchema.parse(await decryptJson(key, envelope.payload, this.recordContext(recordId)));
      invariant(body.audit.wallet === header.wallet, 'AUDIT_WALLET', 'An encrypted audit record has an unexpected wallet.');
      if (body.type === 'credential') {
        const credential = body.credential;
        invariant(credential.revision === recordId && body.audit.credentialId === credential.id &&
          body.audit.action === (credential.parentRevision ? 'credential.updated' : 'credential.created'),
        'AUDIT_RECORD', 'Credential audit data does not match its revision.');
        const password = z.string().max(4096).parse(await decryptJson(key, credential.encryptedPassword,
          this.secretContext(credential.id, recordId)));
        const { encryptedPassword: _encryptedPassword, ...fields } = credential;
        records.push({ body, credential: { ...fields, password, blobId: item.blob_id }, blobId: item.blob_id });
      } else records.push({ body, blobId: item.blob_id });
      await cacheRecord(this.scope, item.blob_id, envelope);
    }
    this.active();
    const snapshot = projectVault(records, blobs);
    pinContinuity(this.scope, this.headerBlobId!, inventory.map((item) => item.blob_id));
    return snapshot;
  }

  private recordContext(recordId: string): string { return `keeva:record:v1:${this.scope}:${this.header!.vaultId}:${recordId}`; }
  private secretContext(id: string, revision: string): string { return `keeva:secret:v1:${this.scope}:${this.header!.vaultId}:${id}:${revision}`; }

  async searchVault(query: string): Promise<VaultSnapshot['credentials']> {
    invariant(query.length <= 1000, 'SEARCH_LENGTH', 'Search text is too long.');
    const snapshot = await this.synchronize();
    await this.memwal.recall({ query: DISCOVERY_QUERY, topK: 15, namespace: this.config.memwalNamespace });
    this.active();
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return snapshot.credentials.filter((item) => {
      const content = [item.siteName, item.username, item.notes, item.category, item.kind].join(' ').toLocaleLowerCase();
      return words.every((word) => content.includes(word));
    });
  }

  async storeEncryptedCredential(input: CredentialInput, edit?: { id: string; revision: string }): Promise<VaultSnapshot> {
    return this.withWriteLock(async () => {
      const key = this.unlocked();
      invariant(!this.hasPendingWrite(), 'PENDING_WRITE', 'Finish the pending write before creating another revision.');
      const payload = credentialInputSchema.parse(input);
      const current = await this.synchronize();
      const previous = edit ? current.credentials.find((item) => item.id === edit.id && item.revision === edit.revision) : undefined;
      if (edit) invariant(previous && !current.conflicts.includes(edit.id), 'REVISION_CONFLICT', 'This credential changed or has concurrent revisions. Refresh and review its history.');
      const now = new Date().toISOString();
      const id = previous?.id ?? crypto.randomUUID();
      const revision = crypto.randomUUID();
      const { password, ...fields } = payload;
      const credential = { ...fields, id, revision, parentRevision: previous?.revision ?? null,
        createdAt: previous?.createdAt ?? now, updatedAt: now,
        encryptedPassword: await encryptJson(key, password, this.secretContext(id, revision)) };
      const body: RecordBody = { type: 'credential', credential, audit: {
        id: crypto.randomUUID(), action: previous ? 'credential.updated' : 'credential.created',
        occurredAt: now, wallet: this.wallet.toLowerCase(), agentId: this.config.memwalAgentId.replace(/^0x/, '').toLowerCase(), credentialId: id,
      } };
      await this.writeRecord(revision, body);
      return await this.synchronize();
    });
  }

  async verifyAndRecordTransaction(digest: string) {
    return this.withWriteLock(async () => {
      this.unlocked();
      invariant(!this.hasPendingWrite(), 'PENDING_WRITE', 'Finish the pending write first.');
      const verification = await this.rpc.verifyVaultAuditTransaction(digest, { wallet: this.wallet, eventTypes: this.config.auditEventTypes });
      const audit = auditEventSchema.parse({ id: crypto.randomUUID(), action: 'transaction.checked', occurredAt: new Date().toISOString(),
        wallet: this.wallet.toLowerCase(), agentId: this.config.memwalAgentId.replace(/^0x/, '').toLowerCase(), transactionDigest: digest });
      await this.writeRecord(crypto.randomUUID(), { type: 'audit', audit });
      return verification;
    });
  }

  private async writeRecord(recordId: string, body: RecordBody): Promise<void> {
    const key = this.unlocked();
    const envelope: SecureRecord = { format: 'keeva.record.v1', vaultId: this.header!.vaultId, recordId,
      payload: await encryptJson(key, recordBodySchema.parse(body), this.recordContext(recordId)) };
    this.active();
    this.savePending(`${this.prefix}${recordId}`, recordId, envelope);
    const result = await this.commitPending();
    pinCommittedBlob(this.scope, this.headerBlobId!, result.blob_id);
    await cacheRecord(this.scope, result.blob_id, envelope);
    this.clearPending();
  }

  private savePending(namespace: string, id: string, envelope: SecureRecord | VaultHeader): void {
    const serialized = JSON.stringify(envelope);
    invariant(utf8.encode(serialized).length <= 60_000, 'RECORD_SIZE', 'The encrypted record exceeds the storage text limit. Shorten the notes or secret.');
    localStorage.setItem(`keeva.pending:${this.scope}`, JSON.stringify({ namespace, id, text: serialized }));
  }
  private readPending() {
    const raw = localStorage.getItem(`keeva.pending:${this.scope}`);
    return raw ? pendingSchema.parse(JSON.parse(raw)) : null;
  }
  private clearPending(): void { localStorage.removeItem(`keeva.pending:${this.scope}`); }
  private async commitPending() {
    this.active();
    const pending = this.readPending();
    invariant(pending, 'NO_PENDING_WRITE', 'There is no pending encrypted write.');
    invariant(pending.namespace === this.config.memwalNamespace || pending.namespace === `${this.prefix}${pending.id}`,
      'PENDING_SCOPE', 'The pending write belongs to an unexpected namespace.');
    await this.authorize();
    const health = await this.memwal.health();
    const writes = (health as unknown as { writes?: string }).writes;
    invariant(health.status === 'ok' && health.write_ready !== false && writes !== 'paused' && writes !== 'degraded',
      'WRITES_UNAVAILABLE', 'Walrus writes are currently unavailable. The encrypted operation is retained for retry.');
    const result = await this.memwal.rememberAndWait(pending.text, pending.namespace, { idempotencyKey: pending.id, timeoutMs: 120_000 });
    this.active();
    invariant(result.namespace === pending.namespace && result.owner.toLowerCase() === this.wallet.toLowerCase() && /^[A-Za-z0-9_-]{43}$/.test(result.blob_id),
      'WRITE_RECEIPT', 'The storage receipt did not match the encrypted operation.');
    return result;
  }

  async retryPendingWrite(): Promise<VaultSnapshot> {
    return this.withWriteLock(async () => {
      const key = this.unlocked();
      const pending = this.readPending();
      invariant(pending, 'NO_PENDING_WRITE', 'There is no pending encrypted write.');
      if (pending.namespace === this.config.memwalNamespace) {
        const header = vaultHeaderSchema.parse(JSON.parse(pending.text));
        invariant(header.vaultId === this.header!.vaultId, 'PENDING_SCOPE', 'The pending header belongs to another vault.');
        await this.checkKey(key, header);
      } else {
        const envelope = secureRecordSchema.parse(JSON.parse(pending.text));
        invariant(envelope.vaultId === this.header!.vaultId && envelope.recordId === pending.id, 'PENDING_SCOPE', 'The pending record belongs to another vault.');
        recordBodySchema.parse(await decryptJson(key, envelope.payload, this.recordContext(pending.id)));
      }
      const result = await this.commitPending();
      pinCommittedBlob(this.scope, this.headerBlobId!, result.blob_id);
      this.clearPending();
      return await this.synchronize();
    });
  }

  async restoreVaultIndex() {
    await this.authorize();
    const root = await this.memwal.restore(this.config.memwalNamespace, 100);
    const namespaces = new Set<string>();
    let cursor: string | undefined;
    const visited = new Set<string>();
    for (;;) {
      this.active();
      const page = await this.memwal.listNamespaces({ cursor, limit: 500 });
      for (const namespace of page.namespaces) if (namespace.name.startsWith(this.prefix)) namespaces.add(namespace.name);
      if (!page.has_more) break;
      invariant(page.next_cursor && !visited.has(page.next_cursor), 'PAGINATION', 'The namespace cursor did not advance.');
      visited.add(page.next_cursor); cursor = page.next_cursor;
    }
    for (const item of await this.inventory()) if (item.namespace_id.startsWith(this.prefix)) namespaces.add(item.namespace_id);
    const results = [root];
    for (const namespace of namespaces) {
      this.active();
      results.push(await this.memwal.restore(namespace, 100));
    }
    this.active();
    return { restored: results.reduce((total, item) => total + item.restored, 0),
      failed: results.reduce((total, item) => total + item.failed, 0), truncated: results.some((item) => item.truncated),
      namespaces: results.length, scope: 'relayer-discovered-namespaces' as const };
  }

  async exportEncryptedBackup(): Promise<Blob> {
    const snapshot = await this.synchronize();
    const records: Array<{ blob: BlobEntry; envelope: SecureRecord }> = [];
    for (const blob of snapshot.blobs) {
      if (blob.namespace === this.config.memwalNamespace) continue;
      const envelope = await readCachedRecord(this.scope, blob.blobId);
      invariant(envelope, 'BACKUP_INCOMPLETE', 'An encrypted backup record is missing from the synchronized cache.');
      records.push({ blob, envelope });
    }
    this.active();
    return new Blob([JSON.stringify({ format: 'keeva.backup.v1', exportedAt: new Date().toISOString(),
      headerBlobId: this.headerBlobId, header: this.header, records })], { type: 'application/json' });
  }
}

export type { KdfParameters };
