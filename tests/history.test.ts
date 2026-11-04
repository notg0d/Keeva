import { describe, expect, it } from 'vitest';
import { projectVault } from '../src/services/vaultProjection';
import { createKdf, deriveMasterKey, encryptJson } from '../src/crypto/vaultCrypto';
import { utf8 } from '../src/lib/encoding';
import { analyzeVault } from '../src/services/securityAuditService';
import type { Credential } from '../src/types/vault';

async function makeHistory() {
  const key = await deriveMasterKey(utf8.encode(crypto.randomUUID()), createKdf('passphrase'));
  const id = crypto.randomUUID();
  const password = crypto.randomUUID();
  const first: Credential = { id, revision: crypto.randomUUID(), parentRevision: null, kind: 'login',
    siteName: crypto.randomUUID(), username: crypto.randomUUID(), password, notes: '', category: crypto.randomUUID(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastRotated: new Date().toISOString(), blobId: crypto.randomUUID() };
  const record = async (credential: Credential): Promise<Parameters<typeof projectVault>[0][number]> => {
    const { password, blobId, ...fields } = credential;
    return { credential, blobId, body: { type: 'credential',
      credential: { ...fields, encryptedPassword: await encryptJson(key, password, credential.revision) },
      audit: { id: crypto.randomUUID(), action: credential.parentRevision ? 'credential.updated' : 'credential.created',
        occurredAt: new Date().toISOString(), wallet: crypto.randomUUID(), agentId: crypto.randomUUID(), credentialId: id } } };
  };
  return { first, record };
}

describe('immutable revision projection', () => {
  it('retains current heads, preserves audit history, and exposes concurrent updates', async () => {
    const { first, record } = await makeHistory();
    const second = { ...first, revision: crypto.randomUUID(), parentRevision: first.revision };
    const records = [await record(first), await record(second)];
    expect(projectVault(records, []).credentials.map((item) => item.revision)).toEqual([second.revision]);
    expect(projectVault(records, []).auditEvents).toHaveLength(2);
    const competing = { ...first, revision: crypto.randomUUID(), parentRevision: first.revision };
    const branched = projectVault([...records, await record(competing)], []);
    expect(branched.conflicts).toEqual([first.id]);
    expect(branched.credentials).toHaveLength(2);
  });

  it('rejects missing ancestry, duplicate revisions, and cycles', async () => {
    const { first, record } = await makeHistory();
    const orphan = { ...first, revision: crypto.randomUUID(), parentRevision: crypto.randomUUID() };
    const base = await record(first);
    const orphanRecord = await record(orphan);
    expect(() => projectVault([base, orphanRecord], [])).toThrow('missing');
    const duplicate = await record(first);
    expect(() => projectVault([base, duplicate], [])).toThrow('duplicate credential revision');
    const cyclic = { ...first, revision: crypto.randomUUID(), parentRevision: '' };
    cyclic.parentRevision = cyclic.revision;
    const cycleRecord = await record(cyclic);
    expect(() => projectVault([base, cycleRecord], [])).toThrow('cycle');
  });

  it('computes reuse and age from decrypted credentials without altering them', async () => {
    const { first } = await makeHistory();
    const older = { ...first, id: crypto.randomUUID(), revision: crypto.randomUUID(), lastRotated: new Date(Date.now() - 91 * 86_400_000).toISOString() };
    const matrix = await analyzeVault([first, older]);
    expect(matrix.every((item) => item.reused)).toBe(true);
    expect(matrix.find((item) => item.id === older.id)?.rotationDue).toBe(true);
    expect(first.password).toBe(older.password);
  });
});
