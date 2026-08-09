'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The product in one loop: a QR is scanned, RakshaPay reads it mid-payment,
 * and the payment is stopped with a reason before the PIN screen appears.
 *
 * Built from SVG + CSS keyframes driven by a state machine rather than a video
 * or a WebGL scene. A video cannot be read by a screen reader, costs megabytes
 * on a phone, and cannot re-theme for dark mode; this is a few kilobytes,
 * scales to any width, and freezes on its final frame under
 * `prefers-reduced-motion` so the message still lands without movement.
 */

type Phase = 'idle' | 'scanning' | 'reading' | 'blocked';

const PHASE_MS: Record<Phase, number> = {
  idle: 700,
  scanning: 1900,
  reading: 1200,
  blocked: 3000,
};

const NEXT: Record<Phase, Phase> = {
  idle: 'scanning',
  scanning: 'reading',
  reading: 'blocked',
  blocked: 'idle',
};

export function ScanInterceptScene() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [still, setStill] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStill(true);
      setPhase('blocked');
      return;
    }

    timer.current = window.setTimeout(() => setPhase(NEXT[phase]), PHASE_MS[phase]);
    return () => window.clearTimeout(timer.current);
  }, [phase]);

  const caption =
    phase === 'scanning'
      ? 'A QR is scanned at the counter…'
      : phase === 'reading'
        ? 'RakshaPay reads it before the PIN screen'
        : phase === 'blocked'
          ? 'Stopped — and told you why'
          : 'Ready to pay';

  return (
    <div className="relative select-none" aria-hidden>
      <svg viewBox="0 0 340 300" className="h-auto w-full max-w-md" role="presentation">
        <defs>
          <clipPath id="scan-clip">
            <rect x="28" y="70" width="120" height="120" rx="10" />
          </clipPath>
          <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7CC5FF" stopOpacity="0" />
            <stop offset="50%" stopColor="#7CC5FF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7CC5FF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The QR on the counter */}
        <g>
          <rect x="28" y="70" width="120" height="120" rx="10" fill="#FFFFFF" opacity="0.96" />
          <QrArt />
          {(phase === 'scanning' || still) && (
            <g clipPath="url(#scan-clip)">
              <rect
                x="28"
                width="120"
                height="26"
                fill="url(#beam)"
                y={still ? 150 : 70}
                className={still ? undefined : 'scan-beam'}
              />
            </g>
          )}
          <text x="88" y="212" textAnchor="middle" className="fill-white/45 text-[9px]">
            Sticker on the counter
          </text>
        </g>

        {/* Path from the QR to the phone */}
        <path
          d="M156 130 H196"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />

        {/* The phone */}
        <g transform="translate(196 42)">
          <rect x="0" y="0" width="118" height="216" rx="17" fill="#0C1330" stroke="rgba(255,255,255,0.18)" />
          <rect x="7" y="9" width="104" height="198" rx="12" fill="#F3F5FB" />

          {phase === 'blocked' || still ? (
            <g className={still ? undefined : 'verdict-in'}>
              <rect x="7" y="9" width="104" height="198" rx="12" fill="#FBE3E3" />
              <circle cx="59" cy="72" r="26" fill="none" stroke="#D03C3C" strokeWidth="6" />
              <path d="M50 63 L68 81 M68 63 L50 81" stroke="#D03C3C" strokeWidth="6" strokeLinecap="round" />
              <text x="59" y="120" textAnchor="middle" className="fill-[#D03C3C] text-[12px] font-bold">
                High Risk
              </text>
              <text x="59" y="140" textAnchor="middle" className="fill-[#16224A] text-[7.5px]">
                Payee ID looks made-up,
              </text>
              <text x="59" y="151" textAnchor="middle" className="fill-[#16224A] text-[7.5px]">
                not like a real shop
              </text>
              <rect x="22" y="166" width="74" height="20" rx="10" fill="#D03C3C" />
              <text x="59" y="180" textAnchor="middle" className="fill-white text-[8px] font-bold">
                Don&apos;t pay
              </text>
            </g>
          ) : (
            <g>
              <rect x="20" y="34" width="78" height="10" rx="5" fill="#16224A" opacity="0.12" />
              <rect x="20" y="52" width="56" height="10" rx="5" fill="#16224A" opacity="0.12" />
              {phase === 'reading' && (
                <g className="pulse-soft">
                  <circle cx="59" cy="112" r="20" fill="none" stroke="#16224A" strokeWidth="3" opacity="0.35" />
                  <circle cx="59" cy="112" r="8" fill="#16224A" opacity="0.55" />
                </g>
              )}
              <rect x="20" y="166" width="78" height="20" rx="10" fill="#16224A" opacity="0.15" />
            </g>
          )}
        </g>

        {/* Shield badge that appears at the moment of interception */}
        {(phase === 'reading' || phase === 'blocked' || still) && (
          <g transform="translate(158 24)" className={still ? undefined : 'badge-in'}>
            <circle cx="16" cy="16" r="16" fill="#16224A" stroke="rgba(255,255,255,0.35)" />
            <path
              d="M16 7l6 2.6v4.7c0 3.7-2.5 7-6 8.1-3.5-1.1-6-4.4-6-8.1V9.6z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M13.6 15.5l1.7 1.7 3.1-3.3" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        )}
      </svg>

      <p className="mt-3 text-center text-sm font-medium text-white/70 transition-opacity duration-300">
        {caption}
      </p>
    </div>
  );
}

function QrArt() {
  // A fixed pattern rather than a random one: a QR that reshuffles every render
  // reads as noise, and this only has to look like a QR.
  const cells = [
    [0, 0], [1, 0], [2, 0], [4, 0], [6, 0], [7, 0], [8, 0],
    [0, 1], [2, 1], [4, 1], [5, 1], [6, 1], [8, 1],
    [0, 2], [1, 2], [2, 2], [4, 2], [6, 2], [7, 2], [8, 2],
    [3, 3], [5, 3], [1, 4], [3, 4], [4, 4], [7, 4], [2, 5], [5, 5], [6, 5],
    [0, 6], [1, 6], [2, 6], [4, 6], [6, 6], [7, 6], [8, 6],
    [0, 7], [2, 7], [3, 7], [5, 7], [8, 7],
    [0, 8], [1, 8], [2, 8], [4, 8], [6, 8], [7, 8], [8, 8],
  ];

  return (
    <g fill="#16224A">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={40 + x * 11} y={82 + y * 11} width={9} height={9} rx={1.5} />
      ))}
    </g>
  );
}
