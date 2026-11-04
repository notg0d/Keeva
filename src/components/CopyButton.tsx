import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { errorMessage } from '../lib/errors';
import { secureClipboard } from '../services/clipboardService';
import { useVault } from '../state/VaultContext';
import { spring } from './Motion';

export default function CopyButton({ value, label, description }: { value: string; label: string; description: string }) {
  const { setMessage } = useVault();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(true);
  const reduce = useReducedMotion();
  useEffect(() => { active.current = true; return () => { active.current = false; clearTimeout(timer.current); }; }, []);
  return <button type="button" className={copied ? 'copy-button copied' : 'copy-button'} disabled={busy} aria-label={copied ? 'Copied to clipboard' : description}
    onClick={() => { setBusy(true); void secureClipboard.copy(value, setMessage).then(() => {
      if (!active.current) return;
      setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2200);
    }).catch((error: unknown) => { if (active.current) setMessage(errorMessage(error)); }).finally(() => { if (active.current) setBusy(false); }); }}>
    <AnimatePresence mode="wait" initial={false}><motion.span key={copied ? 'copied' : 'copy'} className="inline-icon"
      initial={{ opacity: 0, scale: reduce ? 1 : .55, rotate: reduce ? 0 : -20 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: reduce ? 1 : .55 }} transition={reduce ? { duration: 0 } : spring}>
      {copied ? <Check size={15} /> : <Copy size={15} />}</motion.span></AnimatePresence><span>{copied ? 'Copied' : label}</span>
  </button>;
}
