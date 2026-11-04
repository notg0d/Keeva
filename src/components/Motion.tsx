import { motion } from 'framer-motion';
import { useReducedMotion } from '../state/useReducedMotion';
import type { ReactNode } from 'react';

export const spring = { type: 'spring', stiffness: 300, damping: 30 } as const;

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: reduce ? 0 : -6 }} transition={reduce ? { duration: 0 } : spring}>{children}</motion.div>;
}

export function StatusDot({ live = false, tone = 'secure' }: { live?: boolean; tone?: 'secure' | 'network' | 'storage' }) {
  return <span aria-hidden="true" className={`status-dot ${live ? `is-live ${tone}` : ''}`} />;
}
