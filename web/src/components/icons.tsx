// Inline SVGs rather than an icon package: a handful of glyphs is not worth a
// dependency, and inlining keeps them theme-able with currentColor.

type IconProps = { className?: string };

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Shield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z" />
      <path d="M9.2 12.2l2 2 3.6-3.9" />
    </svg>
  );
}

export function QrIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4" />
      <path d="M14 14h3v3h-3zM20.5 14v3M17.5 20.5h3M14 20.5h.01" />
    </svg>
  );
}

export function IdIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11.5" r="2.2" />
      <path d="M5.6 16.4c.7-1.5 2-2.2 3.4-2.2s2.7.7 3.4 2.2M15 10h4M15 13.5h2.5" />
    </svg>
  );
}

export function MessageIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M20.5 12c0 3.9-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 20l1.5-3.4C4.3 15.4 3.5 13.8 3.5 12c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 118 0V10" />
    </svg>
  );
}

export function ScaleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M12 4v16M7 20h10M4 9h16M4 9l-2 5a3 3 0 006 0zM20 9l-2 5a3 3 0 006 0z" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M4 20V5M4 20h16M8 20v-6M12.5 20V9M17 20v-4" />
    </svg>
  );
}

export function CodeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <path d="M10 13.5a4 4 0 006 .5l2.5-2.5a4 4 0 10-5.7-5.7L11.5 7" />
      <path d="M14 10.5a4 4 0 00-6-.5L5.5 12.5a4 4 0 105.7 5.7L12.5 17" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...base}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}
