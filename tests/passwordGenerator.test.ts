import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPasswordRules, generatePassword, type PasswordRules } from '../src/crypto/passwordGenerator';

const alphabets = { lowercase: 'abcdefghijklmnopqrstuvwxyz', uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{}:,.?/~' };
const names = Object.keys(alphabets) as Array<keyof typeof alphabets>;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('password generator options', () => {
  it('uses secure defaults', () => {
    const result = generatePassword(defaultPasswordRules);
    expect(result.password).toHaveLength(24);
    expect(result.entropyBits).toBeGreaterThan(128);
  });

  it('honors every non-empty character-group combination at minimum and maximum lengths', () => {
    for (let mask = 1; mask < 16; mask++) {
      for (const length of [8, 16, 24, 128]) {
        for (const excludeSimilar of [false, true]) {
          const rules: PasswordRules = { length, lowercase: !!(mask & 1), uppercase: !!(mask & 2),
            digits: !!(mask & 4), symbols: !!(mask & 8), excludeSimilar };
          const { password, entropyBits } = generatePassword(rules);
          const allowed = names.filter((name) => rules[name]).map((name) => alphabets[name]).join('');
          expect(password).toHaveLength(length);
          expect([...password].every((character) => allowed.includes(character))).toBe(true);
          for (const name of names.filter((name) => rules[name])) {
            expect([...password].some((character) => alphabets[name].includes(character))).toBe(true);
          }
          if (excludeSimilar) expect(password).not.toMatch(/[Il1O0o]/);
          expect(Number.isFinite(entropyBits)).toBe(true);
          expect(entropyBits).toBeGreaterThan(0);
          expect(entropyBits).toBeLessThanOrEqual(length * Math.log2(allowed.length));
        }
      }
    }
  });

  it.each([NaN, Infinity, -Infinity, -1, 0, 7, 129, 8.5])('rejects invalid length %s', (length) => {
    expect(() => generatePassword({ ...defaultPasswordRules, length })).toThrow('Choose a password length from 8 to 128.');
  });

  it('rejects empty character selections before drawing randomness', () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    expect(() => generatePassword({ length: 24, lowercase: false, uppercase: false, digits: false, symbols: false })).toThrow('Enable at least one');
    expect(random).not.toHaveBeenCalled();
  });

  it('adjusts exact single-group entropy when excluding look-alike characters', () => {
    const rules = { length: 24, lowercase: false, uppercase: false, digits: true, symbols: false };
    const full = generatePassword(rules);
    const reduced = generatePassword({ ...rules, excludeSimilar: true });
    expect(full.entropyBits).toBeCloseTo(24 * Math.log2(10));
    expect(reduced.entropyBits).toBeCloseTo(24 * Math.log2(8));
    expect(reduced.password).toMatch(/^[2-9]{24}$/);
  });

  it('rejects out-of-range random values instead of applying biased modulo', () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint32Array)[0] = 25; return array;
    }).mockImplementationOnce((array) => {
      (array as Uint32Array)[0] = 0xffffffff; return array;
    });
    const { password } = generatePassword({ length: 8, lowercase: true, uppercase: false, digits: false, symbols: false });
    expect(password).toBe('zzzzzzzz');
    expect(random).toHaveBeenCalledTimes(9);
  });

  it('resamples complete candidates missing a required character group', () => {
    const draws = [...Array<number>(8).fill(0), 0, 26, ...Array<number>(6).fill(0)];
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const value = draws.shift();
      if (value === undefined) throw new Error('Unexpected random draw');
      (array as Uint32Array)[0] = value; return array;
    });
    const { password } = generatePassword({ length: 8, lowercase: true, uppercase: true, digits: false, symbols: false });
    expect(password).toBe('aAaaaaaa');
    expect(random).toHaveBeenCalledTimes(16);
  });

  it('fails closed when Web Crypto is unavailable, without a Math.random fallback', () => {
    vi.stubGlobal('crypto', undefined);
    const insecureRandom = vi.spyOn(Math, 'random');
    expect(() => generatePassword(defaultPasswordRules)).toThrow('Secure password generation is unavailable');
    expect(insecureRandom).not.toHaveBeenCalled();
  });
});
