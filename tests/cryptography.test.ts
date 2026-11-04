import { describe, expect, it } from 'vitest';
import { createKdf, decryptJson, deriveMasterKey, encryptJson } from '../src/crypto/vaultCrypto';
import { fromBase64, toBase64, utf8 } from '../src/lib/encoding';
import { generatePassword } from '../src/crypto/passwordGenerator';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { verifyPersonalMessageSignature, verifyTransactionSignature } from '@mysten/sui/verify';
import { Transaction, TransactionDataBuilder } from '@mysten/sui/transactions';

describe('authenticated vault cryptography', () => {
  it('round-trips credentials and rejects altered data, context, and unlock material', async () => {
    const kdf = createKdf('passphrase');
    const passphrase = utf8.encode(generatePassword({ length: 32, lowercase: true, uppercase: true, digits: true, symbols: true }).password);
    const key = await deriveMasterKey(passphrase, kdf);
    const payload = { siteName: crypto.randomUUID(), username: crypto.randomUUID(), password: crypto.randomUUID(),
      category: crypto.randomUUID(), notes: '機密 🔐', lastRotated: new Date().toISOString() };
    const context = `keeva:record:${crypto.randomUUID()}`;
    const encrypted = await encryptJson(key, payload, context);
    expect(await decryptJson(key, encrypted, context)).toEqual(payload);
    expect(JSON.stringify(encrypted)).not.toContain(payload.password);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    const ciphertext = fromBase64(encrypted.ciphertext); ciphertext[0] = ciphertext[0]! ^ 1;
    await expect(decryptJson(key, { ...encrypted, ciphertext: toBase64(ciphertext) }, context)).rejects.toThrow('Unable to authenticate');
    await expect(decryptJson(key, encrypted, `${context}:other`)).rejects.toThrow('Unable to authenticate');
    const wrongKey = await deriveMasterKey(utf8.encode(crypto.randomUUID()), kdf);
    await expect(decryptJson(wrongKey, encrypted, context)).rejects.toThrow('Unable to authenticate');
    const next = await encryptJson(key, payload, context);
    expect(next.iv).not.toBe(encrypted.iv);
    expect(next.ciphertext).not.toBe(encrypted.ciphertext);
    passphrase.fill(0);
  });

  it('validates derivation work factors before performing cryptographic work', async () => {
    await expect(deriveMasterKey(utf8.encode(crypto.randomUUID()), { ...createKdf('passphrase'), iterations: 1 })).rejects.toThrow();
  });

  it('reproduces private Ed25519 wallet material and verifies its owner', async () => {
    const wallet = Ed25519Keypair.generate();
    const message = utf8.encode(`Keeva authorization ${crypto.randomUUID()}`);
    const first = await wallet.signPersonalMessage(message);
    const second = await wallet.signPersonalMessage(message);
    expect(first.signature).toBe(second.signature);
    await expect(verifyPersonalMessageSignature(message, first.signature, { address: wallet.toSuiAddress() })).resolves.toBeDefined();
    await expect(verifyPersonalMessageSignature(message, first.signature, { address: Ed25519Keypair.generate().toSuiAddress() })).rejects.toThrow();
  });

  it('binds transaction digests and intent signatures to the exact serialized bytes', async () => {
    const wallet = Ed25519Keypair.generate();
    const transaction = new Transaction();
    transaction.setSender(wallet.toSuiAddress());
    transaction.setGasOwner(wallet.toSuiAddress());
    transaction.setGasBudget(10_000_000);
    transaction.setGasPrice(1000);
    transaction.setGasPayment([]);
    const bytes = await transaction.build();
    const signed = await wallet.signTransaction(bytes);
    expect(TransactionDataBuilder.getDigestFromBytes(bytes)).toBe(await transaction.getDigest());
    await expect(verifyTransactionSignature(bytes, signed.signature, { address: wallet.toSuiAddress() })).resolves.toBeDefined();
    const changed = Uint8Array.from(bytes); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    await expect(verifyTransactionSignature(changed, signed.signature)).rejects.toThrow();
  });
});

describe('cryptographic password generator', () => {
  it('honors enabled groups, produces distinct results, and computes constrained entropy', () => {
    const generated = Array.from({ length: 64 }, () => generatePassword({ length: 24, lowercase: true, uppercase: true, digits: true, symbols: true }));
    expect(new Set(generated.map((item) => item.password)).size).toBe(64);
    for (const { password, entropyBits } of generated) {
      expect(password).toHaveLength(24); expect(password).toMatch(/[a-z]/); expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/); expect(password).toMatch(/[^A-Za-z0-9]/); expect(entropyBits).toBeGreaterThan(128);
    }
    const numeric = generatePassword({ length: 20, lowercase: false, uppercase: false, digits: true, symbols: false });
    expect(numeric.password).toMatch(/^\d{20}$/); expect(numeric.entropyBits).toBeCloseTo(20 * Math.log2(10));
    expect(() => generatePassword({ length: 20, lowercase: false, uppercase: false, digits: false, symbols: false })).toThrow();
  });
});
