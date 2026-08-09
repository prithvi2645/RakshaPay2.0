'use client';

import { useState } from 'react';

const ENDPOINTS = [
  { label: 'lookup', path: '/api/v1/lookup?vpa=kyc-refund9931@verifynow' },
  { label: 'patterns', path: '/api/v1/patterns?limit=5' },
  { label: 'stats', path: '/api/v1/stats' },
];

export function ApiTryIt() {
  const [path, setPath] = useState(ENDPOINTS[0].path);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setBody(null);
    try {
      const response = await fetch(path);
      setStatus(response.status);
      setBody(JSON.stringify(await response.json(), null, 2));
    } catch (e) {
      setStatus(null);
      setBody(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ENDPOINTS.map((endpoint) => (
          <button
            key={endpoint.label}
            type="button"
            onClick={() => setPath(endpoint.path)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              path === endpoint.path
                ? 'bg-navy text-white'
                : 'border border-navy/15 text-navy/70 hover:border-navy/35'
            }`}
          >
            {endpoint.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && void send()}
          spellCheck={false}
          aria-label="Request path"
          className="field flex-1 font-mono text-xs"
        />
        <button type="button" onClick={() => void send()} disabled={busy} className="btn-primary px-4 py-2.5 text-xs">
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>

      {body !== null && (
        <div className="mt-4">
          {status !== null && (
            <p className="mb-2 text-xs font-semibold text-muted">
              HTTP <span className={status < 400 ? 'text-safe' : 'text-danger'}>{status}</span>
            </p>
          )}
          <pre className="max-h-80 overflow-auto rounded-xl bg-ink px-4 py-3.5 text-xs leading-relaxed text-white/90">
            <code>{body}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
