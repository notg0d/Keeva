import { describe, expect, it } from 'vitest';
import { MemWal } from '@mysten-incubation/memwal';
import { configSchema } from '../src/config/vaultConfig';
import { testVaultConnectivity } from '../src/services/memwalGateway';
import { createKdf, decryptJson, deriveMasterKey, encryptJson } from '../src/crypto/vaultCrypto';
import { utf8 } from '../src/lib/encoding';

const configured = !!process.env.VITE_TATUM_API_KEY && !!process.env.VITE_MEMWAL_PRIVATE_KEY && !!process.env.VITE_MEMWAL_ACCOUNT_ID && !!process.env.VITE_MEMWAL_AGENT_ID;
const configuration = () => configSchema.parse({ tatumApiKey: process.env.VITE_TATUM_API_KEY,
  memwalPrivateKey: process.env.VITE_MEMWAL_PRIVATE_KEY, memwalAccountId: process.env.VITE_MEMWAL_ACCOUNT_ID,
  memwalAgentId: process.env.VITE_MEMWAL_AGENT_ID, memwalServerUrl: process.env.VITE_MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz',
  memwalNamespace: process.env.VITE_MEMWAL_NAMESPACE || 'vaultos-production', autoLockMinutes: 5, auditEventTypes: [] });

describe.skipIf(!configured)('configured Mainnet gateways', () => {
  it('authenticates the delegate and reads real network telemetry', async () => {
    const result = await testVaultConnectivity(configuration());
    expect(result.health.status).toBe('ok');
    expect(BigInt(result.telemetry.checkpointHeight)).toBeGreaterThan(0n);
    expect(result.telemetry.chainIdentifier).toBe('35834a8a');
  });

  it.skipIf(process.env.KEEVA_INTEGRATION_WRITE !== '1')('commits and retrieves a client-encrypted blob from Mainnet', async () => {
    const config = configuration();
    await testVaultConnectivity(config);
    const namespace = `keeva-verification-${crypto.randomUUID()}`;
    const client = MemWal.create({ key: config.memwalPrivateKey, accountId: config.memwalAccountId,
      serverUrl: config.memwalServerUrl, namespace, recallTimeoutMs: 60_000 });
    try {
      const kdf = createKdf('passphrase');
      const key = await deriveMasterKey(utf8.encode(crypto.randomUUID()), kdf);
      const content = { operationId: crypto.randomUUID(), observedAt: new Date().toISOString() };
      const envelope = await encryptJson(key, content, namespace);
      const receipt = await client.rememberAndWait(JSON.stringify(envelope), namespace, { idempotencyKey: content.operationId, timeoutMs: 120_000 });
      const result = await client.recall({ query: 'Keeva encrypted vault record', namespace, topK: 15 });
      const stored = result.results.find((item) => item.blob_id === receipt.blob_id);
      expect(stored).toBeDefined();
      expect(await decryptJson(key, JSON.parse(stored!.text), namespace)).toEqual(content);
      const restored = await client.restore(namespace);
      expect(restored.failed).toBe(0);
    } finally { client.destroy(); }
  });
});
