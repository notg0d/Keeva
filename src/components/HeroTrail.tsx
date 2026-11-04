import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '../state/useReducedMotion';

type Particle = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; angle: number };

export default function HeroTrail({ hero }: { hero: RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const element = hero.current;
    const surface = canvas.current;
    const context = surface?.getContext('2d');
    if (!element || !surface || !context || reduce) return;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let particles: Particle[] = [];
    let frame = 0;
    let visible = true;
    let previous: { x: number; y: number } | null = null;
    let lastTime = 0;
    let width = 0;
    let height = 0;

    const clear = () => {
      cancelAnimationFrame(frame); frame = 0; particles = []; previous = null;
      context.clearRect(0, 0, width, height);
    };
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      width = element.clientWidth; height = element.clientHeight;
      surface.width = Math.round(width * scale); surface.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const draw = (now: number) => {
      const delta = Math.min((now - lastTime) / 16.67, 2); lastTime = now;
      context.clearRect(0, 0, width, height);
      particles = particles.filter((particle) => now - particle.born < particle.life);
      for (const p of particles) {
        const age = (now - p.born) / p.life;
        p.x += p.vx * delta; p.y += p.vy * delta; p.angle += .008 * delta;
        context.save(); context.translate(p.x, p.y); context.rotate(p.angle);
        context.globalAlpha = (1 - age) ** 2 * .4;
        context.fillStyle = '#d6f5bf';
        context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .45);
        context.restore();
      }
      frame = particles.length ? requestAnimationFrame(draw) : 0;
    };
    const emit = (x: number, y: number, burst = false) => {
      particles.push({ x, y, vx: (Math.random() - .5) * (burst ? 3 : .8), vy: (Math.random() - .6) * (burst ? 3 : .8),
        born: performance.now(), life: 1500 + Math.random() * 1300, size: 3 + Math.random() * 6, angle: Math.random() * Math.PI });
      if (particles.length > 180) particles.shift();
      if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(draw); }
    };
    const quiet = (event: PointerEvent) => event.target instanceof Element && !!event.target.closest('a, button, input, select, textarea, label, [data-pointer-quiet]');
    const move = (event: PointerEvent) => {
      if (!pointer.matches || !visible || event.pointerType !== 'mouse' || quiet(event)) { previous = null; return; }
      const bounds = element.getBoundingClientRect();
      const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
      if (previous) {
        const dx = x - previous.x; const dy = y - previous.y;
        const count = Math.min(10, Math.floor(Math.hypot(dx, dy) / 7));
        for (let i = 0; i < count; i++) emit(previous.x + dx * i / count, previous.y + dy * i / count);
      }
      previous = { x, y };
    };
    const burst = (event: PointerEvent) => {
      if (!pointer.matches || !visible || event.pointerType !== 'mouse' || quiet(event)) return;
      const bounds = element.getBoundingClientRect();
      for (let i = 0; i < 18; i++) emit(event.clientX - bounds.left, event.clientY - bounds.top, true);
    };
    const leave = () => { previous = null; };
    const visibility = () => { if (document.hidden) clear(); };
    const observer = new ResizeObserver(resize); observer.observe(element);
    const intersection = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; if (!visible) clear(); });
    intersection.observe(element);
    element.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('pointerdown', burst, { passive: true });
    element.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', visibility);
    pointer.addEventListener('change', clear);
    return () => {
      clear(); observer.disconnect(); intersection.disconnect();
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerdown', burst);
      element.removeEventListener('pointerleave', leave); document.removeEventListener('visibilitychange', visibility);
      pointer.removeEventListener('change', clear);
    };
  }, [hero, reduce]);

  return <canvas ref={canvas} className="hero-trail" aria-hidden="true" />;
}
