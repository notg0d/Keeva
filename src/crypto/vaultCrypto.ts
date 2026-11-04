import { z } from 'zod';
import { fromBase64, text, toBase64, utf8 } from '../lib/encoding';
import { invariant, VaultError } from '../lib/errors';

export const KDF_ITERATIONS = 600_000;
export const cipherSchema = z.object({
  algorithm: z.literal('AES-256-GCM'),
  iv: z.string().length(16),
  ciphertext: z.string().min(24).max(2_000_000),
}).strict();
export type CipherEnvelope = z.infer<typeof cipherSchema>;
export const kdfSchema = z.object({
  algorithm: z.literal('PBKDF2-SHA256'),
  iterations: z.number().int().min(KDF_ITERATIONS).max(2_000_000),
  salt: z.string().length(44),
  method: z.enum(['passphrase', 'wallet']),
}).strict();
export type KdfParameters = z.infer<typeof kdfSchema>;

export function createKdf(method: KdfParameters['method']): KdfParameters {
  return { algorithm: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS,
    salt: toBase64(crypto.getRandomValues(new Uint8Array(32))), method };
}

export async function deriveMasterKey(material: Uint8Array<ArrayBuffer>, parameters: KdfParameters): Promise<CryptoKey> {
  const kdf = kdfSchema.parse(parameters);
  const salt = fromBase64(kdf.salt);
  invariant(salt.length === 32 && material.length > 0, 'KDF_INPUT', 'Invalid key derivation parameters.');
  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: kdf.iterations }, baseKey,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown, context: string): Promise<CipherEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = utf8.encode(JSON.stringify(value));
  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: utf8.encode(context), tagLength: 128 }, key, bytes,
    );
    return { algorithm: 'AES-256-GCM', iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
  } finally { bytes.fill(0); }
}

export async function decryptJson(key: CryptoKey, input: CipherEnvelope, context: string): Promise<unknown> {
  try {
    const envelope = cipherSchema.parse(input);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: utf8.encode(context), tagLength: 128 },
      key, fromBase64(envelope.ciphertext),
    ));
    try { return JSON.parse(text.decode(plaintext)) as unknown; }
    finally { plaintext.fill(0); }
  } catch (cause) {
    throw new VaultError('AUTHENTICATION_FAILED', 'Unable to authenticate encrypted data. Check the unlock method and passphrase; the record may also be damaged.', { cause });
  }
}

export async function sha256(value: string): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(value))));
}
