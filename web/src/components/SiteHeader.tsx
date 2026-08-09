'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { BrandMark } from './BrandMark';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/check', label: 'Check a payment' },
  { href: '/dashboard', label: 'Live threat feed' },
  { href: '/merchant', label: 'Flagged wrongly?' },
  { href: '/developers', label: 'API' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/10 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-on-accent">
            <BrandMark className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">RakshaPay</span>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-navy text-canvas'
                      : 'text-navy/70 hover:bg-navy/5 hover:text-navy'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle />

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation"
            className="rounded-lg border border-navy/15 px-3 py-2 text-sm font-semibold md:hidden"
          >
            Menu
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line/10 bg-surface px-5 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-3 text-sm font-medium text-navy/80"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
