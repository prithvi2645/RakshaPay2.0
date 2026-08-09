'use client';

import { useEffect, useState } from 'react';

/**
 * Light / dark toggle.
 *
 * Defaults to the system preference and only stores a choice once the user
 * makes one, so someone who never touches it keeps following their OS. The
 * initial class is applied by an inline script in the layout head — doing it
 * here would leave a light flash on every load for dark-mode users.
 */

type Theme = 'light' | 'dark';

export const THEME_KEY = 'rakshapay-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or storage disabled — the toggle still works for this page.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Rendered before hydration too, so the header does not reflow when the
      // button appears. Label stays generic until the theme is known.
      aria-label={theme ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Switch theme'}
      title={theme ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Switch theme'}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-navy/15 text-navy/70 transition hover:border-navy/35 hover:text-navy"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
