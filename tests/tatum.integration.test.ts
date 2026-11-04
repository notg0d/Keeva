import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/vaultConfig';
import { TatumSuiClient } from '../src/services/tatumSuiClient';

const configured = !!process.env.VITE_TATUM_RPC_URL && !!process.env.VITE_TATUM_API_KEY;
const client = () => new TatumSuiClient(process.env.VITE_TATUM_API_KEY!, process.env.VITE_TATUM_RPC_URL!,
  configSchema.shape.tatumApiType.parse(process.env.VITE_TATUM_API_TYPE || 'graphql'));

describe.skipIf(!configured)('configured Tatum Mainnet endpoint', () => {
  it('reads authenticated Mainnet telemetry using the configured interface', async () => {
    const result = await client().getNetworkTelemetry();
    expect(result.chainIdentifier).toBe('35834a8a');
    expect(BigInt(result.checkpointHeight)).toBeGreaterThan(0n);
    expect(BigInt(result.gasPrice)).toBeGreaterThan(0n);
    expect(BigInt(result.totalTransactionBlocks)).toBeGreaterThan(0n);
  });

  it.skipIf(!process.env.KEEVA_INTEGRATION_REJECTED_URL || !process.env.TATUM_GRAPHQL_RECOVERY_URL)('recovers a rejected gateway using the configured Mainnet route', async () => {
    const connection = new TatumSuiClient(process.env.VITE_TATUM_API_KEY!, process.env.KEEVA_INTEGRATION_REJECTED_URL!, 'graphql');
    const result = await connection.getNetworkTelemetry();
    expect(result.chainIdentifier).toBe('35834a8a');
    expect(result.endpoint).toBe(process.env.TATUM_GRAPHQL_RECOVERY_URL);
  });

  it.skipIf(!process.env.KEEVA_INTEGRATION_TX_DIGEST)('verifies an existing transaction and reported checkpoint membership', async () => {
    const result = await client().verifyVaultAuditTransaction(process.env.KEEVA_INTEGRATION_TX_DIGEST!);
    expect(result.transactionDigestVerified).toBe(true);
    expect(result.transactionSignaturesVerified).toBe(true);
    expect(result.signers).toContain(result.sender);
    expect(result.checkpointInclusion).toBe('rpc-attested');
  });
});
