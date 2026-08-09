'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { detectFraudSignals } from '@/lib/risk/fraudSignals';
import { classifySender, senderRiskMultiplier } from '@/lib/risk/senderReputation';
import { ScamTextMatcher, type TextModelWeights } from '@/lib/risk/textModel';
import { levelForScore, LEVEL_LABEL, type RiskLevel } from '@/lib/risk/types';

/**
 * The correction layer, running live.
 *
 * This is the one idea in the project that a paragraph explains badly and one
 * interaction explains instantly: change who sent a message and watch the same
 * wording land on a different verdict. It runs the real weights — only the JSON
 * model, not ONNX, so the widget costs one small fetch and can sit on the
 * landing page without delaying it.
 *
 * The user-facing labels deliberately describe WHAT is being checked, never how
 * it is implemented: no model names, no multipliers, no thresholds. The public
 * site is not the place the method is documented.
 */

const MESSAGES = [
  {
    id: 'promo',
    label: 'Promotional SMS',
    body: 'Special offer! Get 2GB extra data on Rs.399 recharge. Limited period offer. Recharge now and win cashback rewards!',
  },
  {
    id: 'scam',
    label: 'KYC scam',
    body: 'Dear customer your SBI account will be blocked today. Complete KYC now and share the OTP sent to your number to keep your account active.',
  },
];

const SENDERS = [
  { id: 'VM-HDFCBK', label: 'VM-HDFCBK', caption: 'Registered business header' },
  { id: '9876543210', label: '9876543210', caption: 'Personal mobile number' },
];

export function CorrectionDemo() {
  const [matcher, setMatcher] = useState<ScamTextMatcher | null>(null);
  const [messageId, setMessageId] = useState(MESSAGES[0].id);
  const [senderId, setSenderId] = useState(SENDERS[0].id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/models/scam_text_model.json');
        if (!response.ok) return;
        const weights = (await response.json()) as TextModelWeights;
        if (cancelled) return;
        const next = new ScamTextMatcher();
        next.loadFromWeights(weights);
        setMatcher(next);
      } catch {
        // The widget is illustrative; the checker is where the real work is.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const message = MESSAGES.find((m) => m.id === messageId)!;

  const steps = useMemo(() => {
    if (!matcher) return null;

    const modelScore = Math.round(matcher.scamProbability(message.body) * 100);
    const trust = classifySender(senderId);
    const multiplier = senderRiskMultiplier(trust);
    const adjusted = Math.round(modelScore * multiplier);
    const signals = detectFraudSignals(message.body);

    let final = modelScore * multiplier;
    if (signals.length > 0) {
      final = Math.max(final, 60) + (signals.length - 1) * 12;
    } else {
      final = Math.min(55, final);
    }
    final = Math.min(100, Math.max(0, Math.round(final)));

    return { modelScore, multiplier, adjusted, signals, final, level: levelForScore(final) };
  }, [matcher, message.body, senderId]);

  return (
    <div className="card">
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          legend="The message"
          options={MESSAGES.map((m) => ({ id: m.id, label: m.label }))}
          value={messageId}
          onChange={setMessageId}
        />
        <Choice
          legend="Who sent it"
          options={SENDERS.map((s) => ({ id: s.id, label: s.label, caption: s.caption }))}
          value={senderId}
          onChange={setSenderId}
        />
      </div>

      <p className="mt-4 rounded-xl bg-canvas px-4 py-3 text-sm leading-relaxed text-navy/80">
        {message.body}
      </p>

      {!steps ? (
        <p className="mt-5 text-sm text-muted">Loading the model…</p>
      ) : (
        <div className="mt-5 space-y-3">
          <Step n={1} label="RakshaPay reads how the message is written" bar={steps.modelScore} />
          <Step
            n={2}
            label={
              steps.multiplier < 1
                ? 'It checks who sent it — a registered business sender is hard to fake'
                : steps.multiplier > 1
                  ? 'It checks who sent it — this is an ordinary mobile number, not a business'
                  : 'It checks who sent it — this sender could not be verified'
            }
            bar={steps.adjusted}
          />
          <Step
            n={3}
            label={
              steps.signals.length > 0
                ? 'It checks what the message actually asks you to do — and this one asks'
                : 'It checks what the message asks you to do — and this one asks for nothing'
            }
            bar={steps.final}
            emphasis
          />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/10 px-4 py-3">
            <span className="text-sm font-semibold">Verdict</span>
            <VerdictPill level={steps.level} score={steps.final} />
          </div>

          <p className="text-xs leading-relaxed text-muted">
            Switch the sender and watch the verdict change. The same words from a real bank and from
            a stranger are not the same message — which is why an ordinary bank alert never becomes
            an alarm here, and a real scam still does.
          </p>
        </div>
      )}
    </div>
  );
}

function Choice({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<{ id: string; label: string; caption?: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={`rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
              value === option.id
                ? 'bg-navy text-white'
                : 'border border-navy/15 text-navy/70 hover:border-navy/35'
            }`}
          >
            <span className="block font-mono">{option.label}</span>
            {option.caption && (
              <span className={`block text-[10px] font-medium ${value === option.id ? 'text-white/70' : 'text-muted'}`}>
                {option.caption}
              </span>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Step({
  n,
  label,
  bar,
  emphasis,
}: {
  n: number;
  label: string;
  bar: number;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm ${emphasis ? 'font-semibold text-navy' : 'text-navy/75'}`}>
          <span className="mr-2 text-xs font-bold text-muted">{n}</span>
          {label}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: `${Math.min(100, Math.max(2, bar))}%`,
            backgroundColor: bar >= 70 ? '#D03C3C' : bar >= 35 ? '#B5721E' : '#1F9D55',
          }}
        />
      </div>
    </div>
  );
}

function VerdictPill({ level, score }: { level: RiskLevel; score: number }) {
  const tone =
    level === 'safe'
      ? 'bg-safe text-white'
      : level === 'caution'
        ? 'bg-caution text-white'
        : 'bg-danger text-white';
  return (
    <span className={`pill ${tone} transition-colors duration-500 motion-reduce:transition-none`}>
      {LEVEL_LABEL[level]} · {score}/100 risk
    </span>
  );
}
