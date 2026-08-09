'use client';

import { useEffect, useRef } from 'react';

/**
 * Payments flowing toward a checkpoint, with the fraudulent ones stopped at it.
 *
 * Canvas rather than hundreds of animated DOM nodes: this sits behind the first
 * thing anyone sees, and the device it has to stay smooth on is a mid-range
 * Android phone, not a laptop. Everything below is deliberately cheap — no
 * shadows, no gradients per frame, no per-particle allocation after setup.
 *
 * It is decoration and says so: `aria-hidden`, and under `prefers-reduced-motion`
 * it renders one static frame instead of animating. Nothing here is load-bearing
 * for understanding the page.
 */

const SAFE = '#1F9D55';
const DANGER = '#D03C3C';
const CAUTION = '#B5721E';

interface Packet {
  x: number;
  lane: number;
  speed: number;
  fraud: boolean;
  /** 0 = travelling, rises once stopped at the gate. */
  blocked: number;
  radius: number;
}

export function PaymentStream() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const LANES = 7;
    let width = 0;
    let height = 0;
    let gateX = 0;
    let packets: Packet[] = [];
    let frame = 0;
    let raf = 0;

    const laneY = (lane: number) => (height / (LANES + 1)) * (lane + 1);

    function spawn(initial = false): Packet {
      return {
        x: initial ? Math.random() * gateX : -20,
        lane: Math.floor(Math.random() * LANES),
        speed: 0.35 + Math.random() * 0.55,
        // Roughly one in five, which is close to the "1 in 5 UPI users has been
        // targeted" figure the page cites. Not a claim, just a nicer default
        // than an arbitrary number.
        fraud: Math.random() < 0.2,
        blocked: 0,
        radius: 2.5 + Math.random() * 2,
      };
    }

    /**
     * Returns false when the element has not been laid out yet. Measuring on
     * mount alone is not enough: the hero is a grid whose height depends on
     * fonts and its own content, so the first measurement can legitimately come
     * back zero-width and leave a permanently blank canvas.
     */
    function resize() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;

      // Cap the backing store at 2x: beyond that costs fill rate for nothing.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = rect.width;
      height = rect.height;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      gateX = width * 0.62;
      packets = Array.from({ length: Math.min(70, Math.floor(width / 14)) }, () => spawn(true));
      return true;
    }

    function drawGate() {
      const ctx = context!;
      const pulse = reduceMotion ? 0.5 : 0.42 + Math.sin(frame / 40) * 0.12;

      ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(gateX, height * 0.06);
      ctx.lineTo(gateX, height * 0.94);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function step() {
      const ctx = context!;
      ctx.clearRect(0, 0, width, height);
      drawGate();

      for (const packet of packets) {
        const y = laneY(packet.lane);

        if (packet.fraud && packet.x >= gateX - packet.radius) {
          // Held at the checkpoint, then faded out — the visual claim is
          // "stopped before it goes through", which is what the product does.
          packet.x = gateX - packet.radius;
          packet.blocked += reduceMotion ? 0 : 0.012;
          if (packet.blocked > 1) Object.assign(packet, spawn());
        } else {
          packet.x += reduceMotion ? 0 : packet.speed;
          if (packet.x > width + 20) Object.assign(packet, spawn());
        }

        const fading = 1 - packet.blocked;
        ctx.globalAlpha = packet.fraud ? 0.35 + 0.65 * fading : 0.55;
        ctx.fillStyle = packet.fraud ? DANGER : packet.x > gateX ? SAFE : CAUTION;

        ctx.beginPath();
        ctx.arc(packet.x, y, packet.radius, 0, Math.PI * 2);
        ctx.fill();

        // A short trail, drawn as one stroke rather than a history buffer.
        ctx.globalAlpha *= 0.28;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = packet.radius * 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.max(0, packet.x - 26), y);
        ctx.lineTo(packet.x, y);
        ctx.stroke();

        if (packet.fraud && packet.blocked > 0) {
          ctx.globalAlpha = (1 - packet.blocked) * 0.8;
          ctx.strokeStyle = DANGER;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(gateX, y, 6 + packet.blocked * 16, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      frame++;
      if (!reduceMotion) raf = requestAnimationFrame(step);
    }

    let running = false;

    function start() {
      if (running) return;
      if (!resize()) return;
      running = true;
      step();
    }

    // ResizeObserver rather than a window listener: it fires once the element
    // actually has a box, which a window 'resize' event never does on its own.
    const observer = new ResizeObserver(() => {
      if (!running) start();
      else resize();
    });
    observer.observe(canvas);
    start();

    // Animating while the tab is hidden burns battery for nothing.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduceMotion && running) raf = requestAnimationFrame(step);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 h-full w-full"
    />
  );
}
