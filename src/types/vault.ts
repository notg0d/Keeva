import { z } from 'zod';
import { cipherSchema, kdfSchema } from '../crypto/vaultCrypto';

export const credentialInputSchema = z.object({
  kind: z.enum(['login', 'note', 'api-key']),
  siteName: z.string().trim().min(1).max(160),
  username: z.string().max(320),
  password: z.string().max(4096),
  notes: z.string().max(12_000),
  category: z.string().trim().min(1).max(80),
  lastRotated: z.iso.datetime(),
}).strict().refine((value) => value.kind === 'note' || value.password.length > 0, {
  message: 'A secret is required for this item type.', path: ['password'],
}).refine((value) => Date.parse(value.lastRotated) <= Date.now() + 60_000, {
  message: 'Rotation time cannot be in the future.', path: ['lastRotated'],
});
export type CredentialInput = z.infer<typeof credentialInputSchema>;

export const encryptedCredentialSchema = z.object({
  id: z.uuid(), revision: z.uuid(), parentRevision: z.uuid().nullable(),
  kind: z.enum(['login', 'note', 'api-key']), siteName: z.string().max(160),
  username: z.string().max(320), encryptedPassword: cipherSchema,
  notes: z.string().max(12_000), category: z.string().min(1).max(80),
  lastRotated: z.iso.datetime(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export type EncryptedCredential = z.infer<typeof encryptedCredentialSchema>;
export type Credential = Omit<EncryptedCredential, 'encryptedPassword'> & { password: string; blobId: string };

export const auditEventSchema = z.object({
  id: z.uuid(), action: z.enum(['credential.created', 'credential.updated', 'transaction.checked']),
  occurredAt: z.iso.datetime(), wallet: z.string(), agentId: z.string(),
  credentialId: z.uuid().optional(), transactionDigest: z.string().optional(),
}).strict();
export type AuditEvent = z.infer<typeof auditEventSchema> & { blobId: string };

export const recordBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('credential'), credential: encryptedCredentialSchema, audit: auditEventSchema }).strict(),
  z.object({ type: z.literal('audit'), audit: auditEventSchema }).strict(),
]);
export type RecordBody = z.infer<typeof recordBodySchema>;

export const vaultHeaderSchema = z.object({
  format: z.literal('keeva.header.v1'), vaultId: z.uuid(), accountId: z.string(),
  namespace: z.string(), wallet: z.string(), kdf: kdfSchema, check: cipherSchema,
}).strict();
export type VaultHeader = z.infer<typeof vaultHeaderSchema>;

export const secureRecordSchema = z.object({
  format: z.literal('keeva.record.v1'), vaultId: z.uuid(), recordId: z.uuid(),
  payload: cipherSchema,
}).strict();
export type SecureRecord = z.infer<typeof secureRecordSchema>;

export interface BlobEntry {
  blobId: string; namespace: string; createdAt: string; size: number;
  expiresAt: string | null; endEpoch: number | null; status: string;
}
export interface VaultSnapshot {
  credentials: Credential[]; auditEvents: AuditEvent[]; blobs: BlobEntry[];
  conflicts: string[]; synchronizedAt: string;
}
