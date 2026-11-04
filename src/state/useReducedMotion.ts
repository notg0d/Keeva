import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (notify: () => void) => {
  const preference = window.matchMedia(query);
  preference.addEventListener('change', notify);
  return () => preference.removeEventListener('change', notify);
};
const getSnapshot = () => window.matchMedia(query).matches;

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
