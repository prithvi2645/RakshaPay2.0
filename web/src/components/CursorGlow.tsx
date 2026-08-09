'use client';

import { useEffect } from 'react';

/**
 * A scanner light that follows the cursor.
 *
 * Two effects from one pointer listener:
 *
 *  1. A soft page-wide glow, as if a torch were being shone over the particle
 *     field behind the content.
 *  2. A spotlight on whichever `.card` is under the cursor, lit from the exact
 *     point the cursor sits rather than from the card's centre.
 *
 * Everything is done by writing CSS custom properties and letting the compositor
 * paint — no React state, so no re-render per mouse move, and the actual writes
 * are throttled to one animation frame. Moving a mouse fast can fire pointermove
 * hundreds of times a second; doing work on each one is how a page starts to
 * feel heavy.
 *
 * Skipped entirely on touch devices (a finger only reports while pressed, so the
 * glow would flicker rather than follow) and under reduced motion.
 */
export function CursorGlow() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    let x = 0;
    let y = 0;
    let queued = false;
    let activeCard: HTMLElement | null = null;

    function paint() {
      queued = false;
      root.style.setProperty('--cursor-x', `${x}px`);
      root.style.setProperty('--cursor-y', `${y}px`);

      const card = document.elementFromPoint(x, y)?.closest<HTMLElement>('.card') ?? null;

      if (card !== activeCard) {
        activeCard?.classList.remove('card-lit');
        card?.classList.add('card-lit');
        activeCard = card;
      }

      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--card-x', `${x - rect.left}px`);
        card.style.setProperty('--card-y', `${y - rect.top}px`);
      }
    }

    function onMove(event: PointerEvent) {
      x = event.clientX;
      y = event.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    }

    function onLeave() {
      root.style.setProperty('--cursor-opacity', '0');
      activeCard?.classList.remove('card-lit');
      activeCard = null;
    }

    function onEnter() {
      root.style.setProperty('--cursor-opacity', '1');
    }

    root.style.setProperty('--cursor-opacity', '1');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('pointerenter', onEnter);

    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerenter', onEnter);
      activeCard?.classList.remove('card-lit');
      root.style.removeProperty('--cursor-opacity');
    };
  }, []);

  return <div aria-hidden className="cursor-glow" />;
}
