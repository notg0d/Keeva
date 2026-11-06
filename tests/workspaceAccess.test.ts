import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultSnapshot } from '../src/types/vault';

const vault = vi.hoisted(() => ({ snapshot: null as VaultSnapshot | null,
  service: { hasPendingWrite: () => false }, busy: false, error: '', message: '',
  lock: () => {}, setMessage: () => {}, execute: vi.fn() }));

vi.mock('../src/state/VaultContext', () => ({ useVault: () => vault }));
vi.mock('../src/state/ConfigContext', () => ({ useConfig: () => ({ config: { memwalNamespace: 'test-vault' } }) }));
vi.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../src/components/Initialization', () => ({ default: () => createElement('div', null, 'Vault unlock required') }));
vi.mock('../src/components/SmoothScroll', () => ({ default: () => null }));
vi.mock('../src/components/SystemBar', () => ({ default: () => null }));
vi.mock('../src/components/SettingsDrawer', () => ({ default: () => null }));
vi.mock('../src/views/VaultInventory', () => ({ default: () => null }));

import App from '../src/App';
import PasswordOptions from '../src/components/PasswordOptions';
import { defaultPasswordRules } from '../src/crypto/passwordGenerator';
import PasswordBreachScan from '../src/components/PasswordBreachScan';

afterEach(() => { vault.snapshot = null; });

describe('password generator access', () => {
  it('does not expose the generator or credential operations before unlocking', () => {
    const markup = renderToStaticMarkup(createElement(App));
    expect(markup).toContain('Vault unlock required');
    expect(markup).not.toContain('Password generator');
    expect(markup).not.toContain('Add credential');
    expect(markup).not.toContain('Security audit');
    expect(markup).not.toContain('Scan passwords');
    expect(markup).not.toContain('Vault navigation');
  });

  it('adds the generator to navigation only for an unlocked snapshot', () => {
    // Only the snapshot fields read by App are needed for this render-only access check.
    vault.snapshot = { conflicts: [] } as unknown as VaultSnapshot;
    const markup = renderToStaticMarkup(createElement(App));
    expect(markup).toContain('Vault navigation');
    expect(markup).toContain('Password generator');
    expect(markup).toContain('Add credential');
    expect(markup).toContain('Security audit');
    expect(markup).not.toContain('Vault unlock required');
    vault.snapshot = null;
    expect(renderToStaticMarkup(createElement(App))).not.toContain('Password generator');
  });

  it('keeps the final selected character type enabled', () => {
    const markup = renderToStaticMarkup(createElement(PasswordOptions, {
      rules: { ...defaultPasswordRules, lowercase: false, uppercase: false, symbols: false }, onChange: () => {},
    }));
    expect(markup).toMatch(/type="checkbox" disabled="" checked=""/);
    expect(markup.match(/disabled=""/g)).toHaveLength(1);
    expect(markup).toContain('Adjust password length');
    expect(markup).toContain('Exclude look-alike characters');
  });
});

describe('opt-in breach scan interface', () => {
  it('explains the privacy boundary and does not scan on render', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      const markup = renderToStaticMarkup(createElement(PasswordBreachScan, {
        credentials: [], conflicts: [], disabled: false, onEdit: () => {},
      }));
      expect(markup).toContain('first five characters');
      expect(markup).toContain('IP address and request timing');
      expect(markup).toContain('API keys and secure notes are excluded');
      expect(markup).toContain('not proof of safety');
      expect(markup).toContain('Add a login credential');
      expect(markup).toMatch(/disabled=""[^>]*><svg[^]*?Scan passwords/);
      expect(fetcher).not.toHaveBeenCalled();
    } finally { fetcher.mockRestore(); }
  });
});
