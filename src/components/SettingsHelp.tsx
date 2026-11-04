import { ArrowUpRight } from 'lucide-react';

export type SettingsHelpContent = { text: string; links?: ReadonlyArray<{ href: string; label: string }> };

export default function SettingsHelp({ id, text, links }: SettingsHelpContent & { id: string }) {
  return <p id={id} className="settings-help muted">{text}
    {links && <span className="settings-resource-links">{links.map(({ href, label }) =>
      <a key={href} href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`${label} (opens in a new tab)`}>{label}<ArrowUpRight size={12} aria-hidden="true" /></a>)}</span>}
  </p>;
}
