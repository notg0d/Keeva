import { invariant } from '../lib/errors';

export interface PasswordRules { length: number; lowercase: boolean; uppercase: boolean; digits: boolean; symbols: boolean }
const alphabets = { lowercase: 'abcdefghijklmnopqrstuvwxyz', uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{}:,.?/~' } as const;

function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0]! >= limit);
  return random[0]! % max;
}

export function generatePassword(rules: PasswordRules): { password: string; entropyBits: number } {
  invariant(Number.isInteger(rules.length) && rules.length >= 8 && rules.length <= 128, 'PASSWORD_LENGTH', 'Choose a password length from 8 to 128.');
  const groups = (Object.keys(alphabets) as Array<keyof typeof alphabets>).filter((name) => rules[name]).map((name) => alphabets[name]);
  invariant(groups.length > 0, 'PASSWORD_RULES', 'Enable at least one character group.');
  const alphabet = groups.join('');
  let password: string;
  do {
    password = Array.from({ length: rules.length }, () => alphabet[randomIndex(alphabet.length)]!).join('');
  } while (!groups.every((group) => [...password].some((character) => group.includes(character))));
  let probability = 0;
  for (let mask = 0; mask < 1 << groups.length; mask++) {
    let excluded = 0; let count = 0;
    for (let index = 0; index < groups.length; index++) {
      if (mask & (1 << index)) { excluded += groups[index]!.length; count++; }
    }
    probability += (-1) ** count * ((alphabet.length - excluded) / alphabet.length) ** rules.length;
  }
  return { password, entropyBits: rules.length * Math.log2(alphabet.length) + Math.log2(probability) };
}
