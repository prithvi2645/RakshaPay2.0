'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A real UPI scam, step by step, with the layer that catches each step.
 *
 * Scroll-driven with IntersectionObserver rather than a scroll listener, so the
 * browser does the work off the main thread and nothing janks on a mid-range
 * Android — which is the device this project is actually for. Reduced motion
 * disables the transitions entirely; the content is identical either way.
 */

const STEPS = [
  {
    channel: 'SMS from 98xxxxxx10',
    quote:
      'Dear customer, your SBI KYC expires today. Your account will be blocked. Update now: kyc-verify.sbi-secure.top/update',
    caught: 'RakshaPay flags the message',
    how: 'It is threatening you with an account block to make you hurry, and it came from an ordinary mobile number rather than a registered bank sender.',
    tone: 'caution',
  },
  {
    channel: 'The link inside it',
    quote: 'http://kyc-verify.sbi-secure.top/update',
    caught: 'RakshaPay flags the link',
    how: 'The address borrows a bank name it has nothing to do with, and the site it really goes to was registered on a domain that costs almost nothing.',
    tone: 'danger',
  },
  {
    channel: 'The page asks you to install',
    quote: 'SBI-Secure-Update.apk',
    caught: 'RakshaPay stops you here',
    how: 'This is the end of the scam: a link that installs an app on your phone. No bank distributes its app this way, so this alone is enough to warn you off.',
    tone: 'danger',
  },
  {
    channel: 'Or: a QR at the counter',
    quote: 'upi://pay?pa=kyc-refund9931@verifynow&am=1.00',
    caught: 'RakshaPay flags the payee',
    how: 'The payee ID looks made-up rather than like a real shop, and it is asking for a ₹1 "verification" payment — and other people have already reported it.',
    tone: 'danger',
  },
] as const;

const TONE_CLASS = {
  caution: 'border-caution/30 bg-caution-bg',
  danger: 'border-danger-border bg-danger-bg',
} as const;

export function ScamAnatomy() {
  return (
    <ol className="relative space-y-4 border-l-2 border-navy/10 pl-6 sm:pl-8">
      {STEPS.map((step, index) => (
        <Reveal key={step.channel} delay={index * 60}>
          <li className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.9rem] top-5 grid h-6 w-6 place-items-center rounded-full bg-navy text-[11px] font-bold text-white sm:-left-[2.4rem]"
            >
              {index + 1}
            </span>

            <div className={`rounded-2xl border p-5 ${TONE_CLASS[step.tone]}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {step.channel}
              </p>
              <p className="mt-2 break-words font-mono text-sm leading-relaxed text-navy">
                {step.quote}
              </p>

              <div className="mt-4 rounded-xl bg-surface/70 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-navy">
                  Caught by · {step.caught}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy/80">{step.how}</p>
              </div>
            </div>
          </li>
        </Reveal>
      ))}
    </ol>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Anything the observer cannot serve — no IO support, reduced motion — gets
    // the content immediately rather than a blank space.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}
