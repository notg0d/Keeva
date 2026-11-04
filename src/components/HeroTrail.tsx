import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '../state/useReducedMotion';
import { createHeroParticleField } from '../lib/heroParticleField';

export default function HeroTrail({ hero, paused, pattern }: { hero: RefObject<HTMLElement | null>; paused: boolean; pattern: number }) {
  const background = useRef<HTMLCanvasElement>(null);
  const foreground = useRef<HTMLCanvasElement>(null);
  const field = useRef<ReturnType<typeof createHeroParticleField>>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const element = hero.current;
    if (!element || !background.current || !foreground.current || reduce) return;
    const renderer = createHeroParticleField(background.current, foreground.current);
    if (!renderer) return;
    field.current = renderer;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let visible = false;
    const quiet = (event: PointerEvent) => event.target instanceof Element &&
      !!event.target.closest('a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"], [data-pointer-quiet]');
    const move = (event: PointerEvent) => {
      if (!pointer.matches || event.pointerType !== 'mouse' || quiet(event)) { renderer.leave(); return; }
      const bounds = element.getBoundingClientRect();
      renderer.stir(event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const burst = (event: PointerEvent) => {
      if (!pointer.matches || event.pointerType !== 'mouse' || event.button !== 0 || quiet(event)) return;
      const bounds = element.getBoundingClientRect();
      renderer.shift(event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const resize = () => renderer.resize(element.clientWidth, element.clientHeight);
    const visibility = () => renderer.setVisible(visible && !document.hidden && !document.querySelector('dialog[open], [role="dialog"]'));
    const observer = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; visibility(); });
    const dialogs = new MutationObserver(visibility);
    observer.observe(element);
    intersection.observe(element);
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'role'] });
    element.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('pointerdown', burst, { passive: true });
    element.addEventListener('pointerleave', renderer.leave);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', renderer.leave, { passive: true });
    pointer.addEventListener('change', renderer.leave);
    return () => {
      renderer.destroy(); field.current = null;
      observer.disconnect(); intersection.disconnect(); dialogs.disconnect();
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerdown', burst);
      element.removeEventListener('pointerleave', renderer.leave); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize); window.removeEventListener('scroll', renderer.leave);
      pointer.removeEventListener('change', renderer.leave);
    };
  }, [hero, reduce]);

  useEffect(() => { field.current?.setPaused(paused); }, [paused, reduce]);
  useEffect(() => { if (pattern) field.current?.shift(); }, [pattern]);

  return <div className="hero-particles" aria-hidden="true">
    <canvas ref={background} className="hero-field" />
    <canvas ref={foreground} className="hero-trail" />
  </div>;
}
