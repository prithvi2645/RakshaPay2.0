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
        card: '0 6px 18px rgba(0, 0, 0, 0.08)',
        lift: '0 12px 34px rgba(22, 34, 74, 0.12)',
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
