// Web counterpart of app/lib/widgets/safety_score_ring.dart.
//
// The ring shows the SAFETY score (100 - risk), because a big number should
// mean "good". The risk score is what the models emit and what the API returns;
// flipping it only at the display layer keeps every threshold in the codebase
// expressed the same way round.

import type { RiskLevel } from '@/lib/risk/types';

const STROKE = 12;
const SIZE = 168;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const COLORS: Record<RiskLevel, { ring: string; track: string; text: string }> = {
  safe: { ring: '#1F9D55', track: '#E3F6EA', text: '#1F9D55' },
  caution: { ring: '#B5721E', track: '#FBEFDD', text: '#B5721E' },
  highRisk: { ring: '#D03C3C', track: '#FBE3E3', text: '#D03C3C' },
};

export function SafetyScoreRing({ score, level }: { score: number; level: RiskLevel }) {
  const safety = Math.min(100, Math.max(0, 100 - score));
  const colors = COLORS[level];
  const offset = CIRCUMFERENCE * (1 - safety / 100);

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Safety score ${safety} out of 100`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.track}
          strokeWidth={STROKE}
        />
        <circle
          className="ring-progress"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.ring}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ ['--ring-circumference' as string]: `${CIRCUMFERENCE}` }}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <span className="font-display text-4xl font-bold leading-none" style={{ color: colors.text }}>
          {safety}
        </span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Safety score
        </span>
      </div>
    </div>
  );
}
