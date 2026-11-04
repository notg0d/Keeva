import { useEffect, useLayoutEffect } from 'react';
import { useReducedMotion } from '../state/useReducedMotion';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

export default function SmoothScroll({ screen }: { screen: 'vault' | 'login' }) {
  const reduce = useReducedMotion();
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);
  useEffect(() => {
    if (reduce) return;
    const scroll = new Lenis({
      lerp: .1, smoothWheel: true, syncTouch: false, autoRaf: true,
      anchors: true, allowNestedScroll: true,
      prevent: (node) => !!node.closest('dialog, [role="dialog"], textarea, select, [data-lenis-prevent]'),
      virtualScroll: () => !document.querySelector('dialog[open], [role="dialog"]'),
    });
    return () => scroll.destroy();
  }, [reduce, screen]);
  return null;
}
