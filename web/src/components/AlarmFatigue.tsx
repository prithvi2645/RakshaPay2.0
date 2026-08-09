'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Alarm fatigue, shown rather than argued.
 *
 * Four warnings arrive. The first three are harmless — a delivery update, a
 * recharge offer, a bank debit alert — and each one that fires makes the bell
 * shake less and the row fade further. By the time the real scam arrives, the
 * user has been trained to ignore it, and the last row is greyed out like the
 * rest.
 *
 * Then it resets and runs again with RakshaPay's behaviour: the three harmless
 * ones stay quiet, so the only thing that ever rings is the one that matters.
 *
 * Runs on scroll into view, not on mount, so it is not already finished by the
 * time anyone looks at it.
 */

const EVENTS = [
  { text: 'Your order is out for delivery', scam: false },
  { text: 'Recharge now and get 2GB extra data', scam: false },
  { text: 'Rs.2,450 debited from A/c XX4412', scam: false },
  { text: 'Share the OTP to keep your account active', scam: true },
];

type Mode = 'noisy' | 'quiet';

export function AlarmFatigue() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [mode, setMode] = useState<Mode>('noisy');
  const [started, setStarted] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      // Show the end state of the useful pass rather than an empty box.
      setStill(true);
      setMode('quiet');
      setStep(EVENTS.length);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -20% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || still) return;

    const timer = window.setTimeout(
      () => {
        setStep((current) => {
          if (current < EVENTS.length - 1) return current + 1;
          // End of a pass: switch mode and start over.
          setMode((m) => (m === 'noisy' ? 'quiet' : 'noisy'));
          return -1;
        });
      },
      step === -1 ? 700 : 1150,
    );

    return () => window.clearTimeout(timer);
  }, [started, step, still]);

  const ringingIndex = mode === 'noisy' ? step : step === EVENTS.length - 1 ? step : -1;
  const ringing = ringingIndex >= 0 && ringingIndex < EVENTS.length;
  // Each false alarm buys less attention than the last.
  const attention = mode === 'noisy' ? Math.max(0.18, 1 - Math.max(0, step) * 0.28) : 1;

  return (
    <div ref={ref} className="card">
      <div className="flex items-start gap-4">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors duration-300 ${
            ringing ? 'bg-danger-bg text-danger' : 'bg-navy/8 text-navy/45'
          }`}
          style={{
            transform: ringing && !still ? undefined : 'none',
            animation: ringing && !still ? `bell-shake 420ms ease-in-out` : undefined,
          }}
          aria-hidden
        >
          <BellIcon />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold">
            {mode === 'noisy' ? 'A tool that warns about everything' : 'RakshaPay'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {mode === 'noisy'
              ? 'Four messages arrive. It flags all of them — and you stop reading.'
              : 'The same four messages. Only the last one is worth interrupting you for.'}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {EVENTS.map((event, index) => {
          const fired = index <= step;
          const isRinging = index === ringingIndex;
          const flagged = mode === 'noisy' ? fired : fired && event.scam;

          return (
            <li
              key={event.text}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition-all duration-500 motion-reduce:transition-none ${
                flagged
                  ? event.scam
                    ? 'border-danger/30 bg-danger-bg text-danger'
                    : 'border-caution/25 bg-caution-bg text-caution'
                  : 'border-navy/10 text-muted'
              }`}
              style={{
                opacity: fired ? (mode === 'noisy' && !event.scam ? attention : 1) : 0.28,
                transform: isRinging && !still ? 'translateX(2px)' : 'none',
              }}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  flagged ? (event.scam ? 'bg-danger' : 'bg-caution') : 'bg-navy/20'
                }`}
              />
              <span className="min-w-0 flex-1 truncate">{event.text}</span>
              {flagged && <span className="shrink-0 font-semibold">alert</span>}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        {mode === 'noisy'
          ? 'By the fourth message the warning means nothing — and the fourth one was the real scam.'
          : 'Three silences are what make the fourth warning worth reading.'}
      </p>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8.5a6 6 0 10-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z" />
      <path d="M10.5 19a2 2 0 003 0" />
    </svg>
  );
}
