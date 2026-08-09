'use client';

import { useEffect, useRef } from 'react';

/**
 * Cursor-reactive particle field behind the hero.
 *
 * Particles drift, link to their near neighbours, and push away from the
 * pointer. Decorative only — `aria-hidden`, and under `prefers-reduced-motion`
 * it paints one static frame and stops.
 *
 * Performance notes, because this sits behind the first thing anyone sees and
 * the target device is a mid-range Android phone:
 *
 *  - Particle count scales with viewport area and is hard-capped, so a 4K
 *    monitor does not get a quadratic neighbour search.
 *  - The neighbour pass is O(n²) but n stays under ~90, and it early-exits on
 *    squared distance without a sqrt.
 *  - Pointer tracking is passive and stores raw coordinates only; the work
 *    happens in the frame that was going to render anyway.
 *  - Animation stops entirely when the tab is hidden.
 */

const LINK_DISTANCE = 130;
const POINTER_RADIUS = 150;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let running = false;
    const pointer = { x: -9999, y: -9999, active: false };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(90, Math.max(28, Math.round((width * height) / 16000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.8,
      }));
      return true;
    }

    function frame() {
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        if (!reduceMotion) {
          p.x += p.vx;
          p.y += p.vy;

          // Wrap rather than bounce: bouncing makes particles pile up on the
          // edges, which reads as a bug rather than as drift.
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;
        }

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < POINTER_RADIUS * POINTER_RADIUS && dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const push = (1 - dist / POINTER_RADIUS) * 0.9;
            p.x += (dx / dist) * push;
            p.y += (dy / dist) * push;
          }
        }
      }

      // Links between near neighbours, and a brighter link to the pointer.
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];

        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > LINK_DISTANCE * LINK_DISTANCE) continue;

          const alpha = (1 - Math.sqrt(dist2) / LINK_DISTANCE) * 0.22;
          ctx!.strokeStyle = `rgba(160, 200, 255, ${alpha})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }

        if (pointer.active) {
          const dx = a.x - pointer.x;
          const dy = a.y - pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < POINTER_RADIUS * POINTER_RADIUS) {
            const alpha = (1 - Math.sqrt(dist2) / POINTER_RADIUS) * 0.45;
            ctx!.strokeStyle = `rgba(124, 197, 255, ${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(pointer.x, pointer.y);
            ctx!.stroke();
          }
        }

        ctx!.fillStyle = 'rgba(190, 216, 255, 0.55)';
        ctx!.beginPath();
        ctx!.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      if (!resize()) return;
      running = true;
      frame();
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      // Only react while the pointer is actually over the hero.
      pointer.active =
        pointer.x >= 0 && pointer.x <= rect.width && pointer.y >= 0 && pointer.y <= rect.height;
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    const observer = new ResizeObserver(() => (running ? resize() : start()));
    observer.observe(canvas);
    start();

    // Touch devices get the drift but no pointer interaction: a finger only
    // reports while it is down, which makes the effect flicker rather than feel
    // responsive.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (!coarse && !reduceMotion) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    }

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduceMotion && running) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />;
}
