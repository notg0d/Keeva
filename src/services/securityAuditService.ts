import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import { adjacencyGraphs, dictionary as commonDictionary } from '@zxcvbn-ts/language-common';
import { dictionary, translations } from '@zxcvbn-ts/language-en';
import { sha256 } from '../crypto/vaultCrypto';
import type { Credential } from '../types/vault';

zxcvbnOptions.setOptions({ translations, graphs: adjacencyGraphs, dictionary: { ...commonDictionary, ...dictionary } });
export function passwordStrength(password: string, userInputs: string[] = []) {
  const result = zxcvbn(password.slice(0, 256), userInputs);
  return { score: result.score, estimatedGuessBits: result.guessesLog10 * Math.log2(10),
    weak: password.length < 12 || result.score < 3 };
}

export async function analyzeVault(credentials: Credential[], now = Date.now()) {
  const secrets = credentials.filter((item) => item.kind !== 'note');
  const hashes = await Promise.all(secrets.map((item) => sha256(item.password)));
  const counts = new Map<string, number>();
  for (const hash of hashes) counts.set(hash, (counts.get(hash) ?? 0) + 1);
  return secrets.map((item, index) => {
    const strength = passwordStrength(item.password, [item.username, item.siteName]);
    const ageDays = Math.max(0, Math.floor((now - Date.parse(item.lastRotated)) / 86_400_000));
    return { id: item.id, revision: item.revision, siteName: item.siteName, ...strength,
      ageDays, rotationDue: ageDays > 90, reused: counts.get(hashes[index]!)! > 1 };
  });
}
