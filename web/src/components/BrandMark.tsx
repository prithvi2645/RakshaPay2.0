/**
 * The RakshaPay mark.
 *
 * Path data is copied verbatim from `brand/rakshapay-mark.svg`, which is the
 * source of truth. The Flutter version in `app/lib/widgets/brand_mark.dart`
 * draws the same two paths on the same 48x48 grid, and the launcher icons are
 * generated from that same file — so the app, the website and the icon on the
 * home screen are one mark rather than three that merely resemble each other.
 *
 * Inline rather than an <img> so it inherits `currentColor` and works in both
 * themes without a second asset.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="RakshaPay">
      <path
        d="M24 4 L42 11 V24 C42 34.5 34.8 43.6 24 46.6 C13.2 43.6 6 34.5 6 24 V11 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <path
        d="M15.5 24.5 L21.5 30.5 L33 18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
