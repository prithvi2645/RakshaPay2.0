import type { Metadata } from 'next';

import { ApiTryIt } from '@/components/ApiTryIt';

export const metadata: Metadata = {
  title: 'Threat-intel API',
  description:
    'A documented, CORS-open JSON API over community-confirmed UPI scam patterns, plus the measured model metrics and their disclosed limitations.',
};

export default function DevelopersPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Threat-intel API
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          The most useful place for this intelligence is not our app — it is inside the payment flow
          the user already trusts. So the confirmed-pattern list is a plain JSON API, open across
          origins, with no key to request and nothing to sign up for.
        </p>
      </div>

      <section className="card mt-8">
        <h2 className="font-display text-lg font-bold">Try it</h2>
        <p className="mt-1.5 text-sm text-muted">
          Runs against this deployment. If no Supabase project is configured, every endpoint
          answers <code className="rounded bg-canvas px-1 py-0.5 text-xs">503 backend_unconfigured</code>{' '}
          rather than pretending to have data.
        </p>
        <div className="mt-4">
          <ApiTryIt />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Endpoints</h2>

        <Endpoint
          method="GET"
          path="/api/v1/lookup?vpa=name@bank"
          summary="Is this payee on the confirmed list?"
          body={`{
  "api_version": "1.0",
  "vpa": "kyc-refund9931@verifynow",
  "kind": "vpa",
  "listed": true,
  "report_count": 7,
  "reason_codes": ["fake_refund", "otp_request"],
  "first_reported_at": "2026-08-08T14:02:11.482Z",
  "last_reported_at": "2026-08-09T09:41:55.108Z"
}`}
        >
          <p>
            <code>listed: false</code> means one thing only:{' '}
            <strong>not confirmed by the community</strong>. It is not a safety verdict, and the
            field is deliberately not called <code>safe</code> — the structural and text models that
            produce a verdict run on the client, not here. An integrator that reads a miss as
            &ldquo;safe to pay&rdquo; has misread it.
          </p>
        </Endpoint>

        <Endpoint
          method="GET"
          path="/api/v1/patterns?kind=vpa&limit=100"
          summary="The confirmed list, newest activity first"
          body={`{
  "api_version": "1.0",
  "count": 42,
  "threshold": 3,
  "note": "Only patterns confirmed by 3+ distinct reporting devices are listed.",
  "patterns": [ /* … */ ]
}`}
        >
          <p>
            <code>kind</code> is <code>vpa</code> or <code>phone</code>; <code>limit</code> is 1–200.
            Patterns below the three-reporter threshold are not returned here or anywhere else.
          </p>
        </Endpoint>

        <Endpoint
          method="GET"
          path="/api/v1/stats"
          summary="Aggregate counts, including the appeal numbers"
          body={`{
  "api_version": "1.0",
  "stats": {
    "payments_scored": 1841,
    "high_risk_blocked": 96,
    "patterns_active": 42,
    "reporting_devices": 210,
    "appeals_open": 2,
    "appeals_upheld": 1,
    "appeals_rejected": 3,
    "as_of": "2026-08-09T12:00:00Z"
  }
}`}
        >
          <p>
            Counts only — never an individual report, score, payee, or timestamp. The appeal counts
            are included on purpose: how often the system flags the wrong payee is the number a
            fraud tool is least inclined to publish.
          </p>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/v1/appeal"
          summary="File an appeal against a flag"
          body={`// request
{ "vpa": "yourshop@okaxis", "statement": "…", "contact": "optional" }

// 201
{ "api_version": "1.0",
  "appeal": { "reference": "RP-8C1D42AF90E3", "status": "received", "created_at": "…" } }`}
        >
          <p>
            <code>GET /api/v1/appeal?reference=RP-…</code> returns the status of one appeal. It is
            backed by a <code>SECURITY DEFINER</code> function that returns six fields for that one
            reference and nothing else — the table itself has no read policy, so appeals cannot be
            enumerated.
          </p>
        </Endpoint>
      </section>

      <section className="card mt-10">
        <h2 className="font-display text-xl font-bold">Before you rely on this</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Two constraints on how a response may be read. Both are about meaning, not transport, and
          getting either wrong would put your users at risk rather than merely break your build.
        </p>

        <dl className="mt-5 space-y-3.5">
          <Guarantee term="A miss is not an all-clear">
            <code>listed: false</code> means &ldquo;no confirmed community reports&rdquo; and
            nothing else. The models that produce a safety verdict run on the client and are not
            reachable from here, which is why the field is not called <code>safe</code>.
          </Guarantee>
          <Guarantee term="Everything returned is above the reporting threshold">
            A payee is listed only after three distinct devices reported it independently, enforced
            by <code>unique (vpa, kind, device_hash)</code> in Postgres. Nothing below that appears
            in any endpoint, so this is confirmed intelligence rather than raw accusations.
          </Guarantee>
          <Guarantee term="Aggregates only, always">
            No endpoint exposes an individual report, reporter, score, or timestamp. The tables
            behind them have INSERT policies and no SELECT policies, so this is a property of the
            database, not a promise from the API layer.
          </Guarantee>
        </dl>

        <p className="mt-5 text-sm leading-relaxed text-muted">
          For integration questions beyond this page, or to discuss a production feed, get in touch
          before building against it.
        </p>
      </section>
    </div>
  );
}

function Endpoint({
  method,
  path,
  summary,
  body,
  children,
}: {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article className="card mt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`pill ${
            method === 'GET' ? 'bg-safe-bg text-safe' : 'bg-caution-bg text-caution'
          }`}
        >
          {method}
        </span>
        <code className="break-all font-mono text-sm font-semibold">{path}</code>
      </div>

      <p className="mt-2.5 text-sm font-semibold">{summary}</p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted [&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
        {children}
      </div>

      <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-3.5 text-xs leading-relaxed text-white/90">
        <code>{body}</code>
      </pre>
    </article>
  );
}

function Guarantee({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-navy/10 px-4 py-3.5">
      <dt className="font-display text-sm font-bold">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-muted [&_code]:rounded [&_code]:bg-canvas [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
        {children}
      </dd>
    </div>
  );
}
