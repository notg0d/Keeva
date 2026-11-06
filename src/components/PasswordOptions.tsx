import { useId } from 'react';
import type { PasswordRules } from '../crypto/passwordGenerator';

const groups = [
  { name: 'uppercase', label: 'Uppercase', example: 'A–Z' },
  { name: 'lowercase', label: 'Lowercase', example: 'a–z' },
  { name: 'digits', label: 'Numbers', example: '0–9' },
  { name: 'symbols', label: 'Symbols', example: '!@#$' },
] as const;

export default function PasswordOptions({ rules, onChange }: { rules: PasswordRules; onChange: (rules: PasswordRules) => void }) {
  const id = useId();
  const enabled = groups.filter(({ name }) => rules[name]).length;
  return <div className="password-options">
    <div className="generator-length"><label htmlFor={`${id}-length`}>Password length<span className="small muted">8–128 characters</span></label>
      <input id={`${id}-length`} className="mono" type="number" min={8} max={128} step={1} value={Number.isNaN(rules.length) ? '' : rules.length}
        onChange={(event) => onChange({ ...rules, length: event.target.valueAsNumber })} /></div>
    <input className="generator-slider" type="range" min={8} max={128} step={1} aria-label="Adjust password length"
      value={Number.isFinite(rules.length) ? rules.length : 8} onChange={(event) => onChange({ ...rules, length: Number(event.target.value) })} />
    <fieldset><legend>Include characters</legend><div className="generator-groups">{groups.map(({ name, label, example }) =>
      <label className={`generator-option${rules[name] ? ' selected' : ''}`} key={name}>
        <input type="checkbox" checked={rules[name]} disabled={enabled === 1 && rules[name]} onChange={(event) => onChange({ ...rules, [name]: event.target.checked })} />
        <span>{label}<span className="mono muted">{example}</span></span>
      </label>)}</div></fieldset>
    <p className="small muted">Every selected type is included. Keep at least one selected.</p>
    <label className="check-label generator-similar"><input type="checkbox" checked={!!rules.excludeSimilar} onChange={(event) => onChange({ ...rules, excludeSimilar: event.target.checked })} />
      <span>Exclude look-alike characters<span className="small muted mono"> I, l, 1, O, 0, o</span></span></label>
  </div>;
}
