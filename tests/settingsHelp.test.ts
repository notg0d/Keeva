import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsHelp from '../src/components/SettingsHelp';

describe('configuration field guidance', () => {
  it('renders named external resources without opener or referrer access', () => {
    const markup = renderToStaticMarkup(createElement(SettingsHelp, {
      id: 'help-tatumApiKey', text: 'Use your Mainnet API key.',
      links: [{ href: 'https://dashboard.tatum.io/api-keys', label: 'Get your Tatum API key' }],
    }));
    expect(markup).toContain('id="help-tatumApiKey"');
    expect(markup).toContain('Use your Mainnet API key.');
    expect(markup).toContain('href="https://dashboard.tatum.io/api-keys"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).toContain('aria-label="Get your Tatum API key (opens in a new tab)"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('supports locally chosen preferences without sending users to an unrelated provider', () => {
    const markup = renderToStaticMarkup(createElement(SettingsHelp, {
      id: 'help-autoLockMinutes', text: 'Choose a local inactivity timeout.',
    }));
    expect(markup).toContain('Choose a local inactivity timeout.');
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('settings-resource-links');
  });
});
