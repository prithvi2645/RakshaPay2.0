import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-line/10 bg-surface/70">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-base font-bold">RakshaPay</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
              A UPI fraud shield that runs where the payment happens, and publishes what it
              gets wrong alongside what it gets right.
            </p>
          </div>

          <FooterColumn
            title="Use it"
            links={[
              { href: '/check', label: 'Check a payment' },
              { href: '/merchant', label: 'Appeal a flag' },
            ]}
          />
          <FooterColumn
            title="Look inside"
            links={[
              { href: '/dashboard', label: 'Live threat feed' },
              { href: '/developers', label: 'Threat-intel API' },
            ]}
          />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              If you have already paid
            </p>
            <p className="mt-2 text-sm leading-relaxed text-navy">
              Call <span className="font-semibold">1930</span> (national cyber-fraud helpline)
              and file at{' '}
              <a
                href="https://cybercrime.gov.in"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold underline decoration-navy/30 underline-offset-2"
              >
                cybercrime.gov.in
              </a>
              . The first hour matters most.
            </p>
          </div>
        </div>

        <p className="mt-9 border-t border-line/10 pt-5 text-xs leading-relaxed text-muted">
          RakshaPay is an independent safety tool. It is not affiliated with NPCI, any bank, or any
          UPI app, and it does not move money or see your accounts. A verdict is guidance, not a
          guarantee: always use your own judgement before paying anyone.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-navy hover:underline underline-offset-2">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
