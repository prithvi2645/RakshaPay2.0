import type { Config } from 'tailwindcss';

// Palette is lifted from the Android app's AppColors so the two clients read as
// one product.
// Colours resolve through CSS variables so the whole palette can be swapped for
// dark mode in one place, instead of every component carrying a `dark:` twin.
// `<alpha-value>` keeps Tailwind's opacity modifiers (text-navy/70) working.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: v('--c-navy'),
        ink: v('--c-ink'),
        canvas: v('--c-canvas'),
        surface: v('--c-surface'),
        line: v('--c-line'),
        // Text that sits ON a filled accent (navy / safe / caution / danger).
        // It has to invert with the palette: `bg-navy text-white` is correct in
        // light mode and invisible in dark, where navy becomes a pale tint.
        'on-accent': v('--c-on-accent'),
        safe: v('--c-safe'),
        'safe-bg': v('--c-safe-bg'),
        caution: v('--c-caution'),
        'caution-bg': v('--c-caution-bg'),
        danger: v('--c-danger'),
        'danger-bg': v('--c-danger-bg'),
        'danger-border': v('--c-danger-border'),
        muted: v('--c-muted'),
      },
      boxShadow: {
        // Through variables because a shadow tuned for a white page is
        // invisible on a dark one — dark mode needs a deeper, tighter shadow
        // plus a hairline highlight to give a card any edge at all.
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
