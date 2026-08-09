'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { LinkFindings } from './LinkFindings';
import { ReportPanel } from './ReportPanel';
import { VerdictCard } from './VerdictCard';
import { AlertIcon, IdIcon, LinkIcon, MessageIcon, QrIcon } from './icons';
import { logRiskEvent, syncKnownScamVpas } from '@/lib/community';
import { RiskEngine, type AnalysisDetail } from '@/lib/risk/engine';
import { classifyQrPayload, type QrPayloadCheck } from '@/lib/risk/qrPayload';
import { extractVpa } from '@/lib/risk/textModel';
import { isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'qr' | 'vpa' | 'sms' | 'link';

const MODES: Array<{ id: Mode; label: string; hint: string; Icon: typeof QrIcon }> = [
  { id: 'qr', label: 'Payment QR', hint: 'Upload a QR image or paste its contents', Icon: QrIcon },
  { id: 'vpa', label: 'UPI ID', hint: 'Check a payee before you send anything', Icon: IdIcon },
  { id: 'sms', label: 'Message', hint: 'Paste an SMS or WhatsApp text', Icon: MessageIcon },
  { id: 'link', label: 'Link', hint: 'Check a link before you open it', Icon: LinkIcon },
];

const SAMPLES: Record<Mode, { label: string; value: string; sender?: string }[]> = {
  qr: [
    { label: 'Ordinary merchant QR', value: 'upi://pay?pa=chaiwala.store@okaxis&pn=Chai%20Point&cu=INR' },
    { label: 'Fabricated handle', value: 'upi://pay?pa=kyc-refund9931@verifynow&pn=SBI%20Refund&am=1.00&cu=INR' },
    { label: 'Not a payment QR', value: 'https://example.com/offer?ref=poster' },
  ],
  vpa: [
    { label: 'Ordinary payee', value: 'rahul.sharma@oksbi' },
    { label: 'Random-looking payee', value: 'x9k2plq7z1@paycare' },
  ],
  link: [
    { label: 'Ordinary site', value: 'https://www.sbi.co.in/personal-banking' },
    { label: 'Look-alike domain', value: 'http://sbi.secure-verify-kyc.xyz/login' },
    { label: 'APK drop', value: 'http://download.apk-bank-update.info/sbi-secure.apk' },
    { label: '@ trick', value: 'https://sbi.co.in@evil-domain.tk/steal' },
  ],
  sms: [
    {
      label: 'Real bank alert',
      value:
        'Rs.2,450.00 debited from A/c XX4412 on 09-08-26 to CHAI POINT. Not you? Call 18001234567. -HDFC Bank',
      sender: 'VM-HDFCBK',
    },
    {
      label: 'KYC scam',
      value:
        'Dear customer your SBI account will be blocked today. Complete KYC now and share the OTP sent to your number to keep your account active.',
      sender: '9876543210',
    },
  ],
};

export function Checker() {
  const engineRef = useRef<RiskEngine | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('qr');
  const [payload, setPayload] = useState('');
  const [vpaInput, setVpaInput] = useState('');
  const [smsText, setSmsText] = useState('');
  const [sender, setSender] = useState('');
  const [linkInput, setLinkInput] = useState('');

  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [subject, setSubject] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [rejected, setRejected] = useState<QrPayloadCheck | null>(null);

  // The models are ~530 KB plus the ORT runtime, so they load once on mount
  // rather than on first click — by the time someone has pasted a QR they are
  // ready, and the button never sits there spinning.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');
      const engine = new RiskEngine();
      try {
        await engine.init();
        if (cancelled) return;
        engineRef.current = engine;
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setStatus('error');
        return;
      }

      // Community list is a separate, optional step: a failure here must not
      // stop the local models from working.
      const vpas = await syncKnownScamVpas();
      if (!cancelled && vpas.length > 0) engine.setKnownScamVpas(vpas);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * `overridePayload` exists because a successful image decode runs the check
   * immediately, and `setPayload` has not committed to state by then. Passing
   * the value through avoids scoring the previous payload.
   */
  const runCheck = useCallback(
    async (overridePayload?: string) => {
      const engine = engineRef.current;
      if (!engine) return;

      setError(null);
      setRejected(null);
      setBusy(true);
      try {
        let next: AnalysisDetail;
        let checked: string;
        let source: string;

        if (mode === 'link') {
          const raw = linkInput.trim();
          if (!raw) return;
          // A bare "sbi-verify.xyz/login" is what people actually paste.
          const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
          const analysis = await engine.link.analyze(url);
          next = {
            result: analysis.result,
            modelScore: analysis.modelScore,
            adjustedScore: analysis.modelScore,
            signals: [],
            senderTrust: 'unknown',
            communityOverride: false,
            links: [analysis],
          };
          checked = url;
          source = 'web_link';
        } else if (mode === 'sms') {
          const text = smsText.trim();
          if (!text) return;
          const found = extractVpa(text);
          next = await engine.analyzeMessage(text, {
            sender: sender.trim() || null,
            vpa: found,
          });
          checked = found ?? (sender.trim() ? `from ${sender.trim()}` : 'pasted message');
          source = 'web_sms';
        } else {
          const raw =
            mode === 'vpa'
              ? `upi://pay?pa=${encodeURIComponent(vpaInput.trim())}&cu=INR`
              : (overridePayload ?? payload).trim();
          if (!raw || (mode === 'vpa' && !vpaInput.trim())) return;

          // Refuse anything that is not a UPI payment intent rather than
          // producing a confident number about a question nobody asked.
          const check = classifyQrPayload(raw);
          if (!check.scorable) {
            setDetail(null);
            setRejected(check);
            return;
          }

          next = await engine.analyzeQr(raw);
          checked = next.features?.vpa || raw;
          source = mode === 'vpa' ? 'web_manual' : 'web_qr';
        }

        setDetail(next);
        setSubject(checked);
        void logRiskEvent(next.result, source);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [mode, payload, smsText, sender, vpaInput, linkInput],
  );

  const decodeImage = useCallback(
    async (file: File) => {
      setError(null);
      setRejected(null);
      setDecoding(true);
      try {
        if (!file.type.startsWith('image/')) {
          throw new Error(`${file.name || 'That file'} is not an image.`);
        }

        const jsQR = (await import('jsqr')).default;
        const bitmap = await createImageBitmap(file);

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Could not read the image in this browser.');

        ctx.drawImage(bitmap, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // `dontInvert` is wrong for photographs of screens, which often come
        // out light-on-dark; `attemptBoth` costs one extra pass and recovers
        // exactly the case a worried user is most likely to have.
        const decoded = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'attemptBoth',
        });
        bitmap.close();

        if (!decoded?.data) {
          throw new Error(
            'No QR code found in that image. If the photo has a QR in it, try cropping closer or using a sharper picture.',
          );
        }

        setMode('qr');
        setPayload(decoded.data);

        const check = classifyQrPayload(decoded.data);
        if (!check.scorable) {
          setDetail(null);
          setRejected(check);
          return;
        }

        await runCheck(decoded.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDecoding(false);
      }
    },
    [runCheck],
  );

  const disabled = status !== 'ready' || busy;
  // Never in link mode: the VPA pattern happily matches "sbi.co.in@evil.tld",
  // and offering to report a URL as a scam payee would poison the database with
  // rows no client can ever match against.
  const currentVpa =
    mode === 'link'
      ? ''
      : detail?.features?.vpa || (mode === 'vpa' ? vpaInput.trim() : extractVpa(subject) || '');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      <div className="card">
        <div className="flex flex-wrap gap-2">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              aria-pressed={mode === id}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                mode === id
                  ? 'bg-navy text-white'
                  : 'border border-navy/15 text-navy/70 hover:border-navy/35'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-muted">{MODES.find((m) => m.id === mode)!.hint}</p>

        <div className="mt-5 space-y-4">
          {mode === 'qr' && (
            <>
              <QrDropzone onFile={decodeImage} decoding={decoding} />
              <div>
                <label className="label" htmlFor="payload">
                  Or paste the QR contents
                </label>
                <textarea
                  id="payload"
                  rows={3}
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder="upi://pay?pa=merchant@okaxis&pn=Merchant&am=250.00&cu=INR"
                  className="field resize-y font-mono text-xs"
                />
              </div>
            </>
          )}

          {mode === 'vpa' && (
            <div>
              <label className="label" htmlFor="vpa">
                UPI ID
              </label>
              <input
                id="vpa"
                value={vpaInput}
                onChange={(e) => setVpaInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !disabled && void runCheck()}
                placeholder="name@bank"
                autoComplete="off"
                spellCheck={false}
                className="field font-mono"
              />
            </div>
          )}

          {mode === 'link' && (
            <div>
              <label className="label" htmlFor="link">
                Link
              </label>
              <input
                id="link"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !disabled && void runCheck()}
                placeholder="https://…"
                autoComplete="off"
                spellCheck={false}
                className="field font-mono text-xs"
              />
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                We read the address only. We never open the link — fetching it would tell the
                sender you received their message, and shortened links stay unresolved for that
                reason.
              </p>
            </div>
          )}

          {mode === 'sms' && (
            <>
              <div>
                <label className="label" htmlFor="sms">
                  Message text
                </label>
                <textarea
                  id="sms"
                  rows={5}
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  placeholder="Paste the full message, exactly as you received it."
                  className="field resize-y"
                />
              </div>
              <div>
                <label className="label" htmlFor="sender">
                  Sender (optional, but it matters a lot)
                </label>
                <input
                  id="sender"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="VM-HDFCBK or 9876543210"
                  autoComplete="off"
                  spellCheck={false}
                  className="field font-mono"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  A registered business header like <code>VM-HDFCBK</code> is hard to forge, so we
                  discount it heavily. A plain 10-digit number gets the opposite treatment.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runCheck()}
              disabled={disabled}
              className="btn-primary"
            >
              {busy ? 'Checking…' : status === 'ready' ? 'Check it' : 'Getting ready…'}
            </button>

            <div className="flex flex-wrap gap-2">
              {SAMPLES[mode].map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    if (mode === 'qr') setPayload(sample.value);
                    else if (mode === 'vpa') setVpaInput(sample.value);
                    else if (mode === 'link') setLinkInput(sample.value);
                    else {
                      setSmsText(sample.value);
                      setSender(sample.sender ?? '');
                    }
                    setError(null);
                    setRejected(null);
                  }}
                  className="rounded-lg border border-navy/15 px-2.5 py-1.5 text-xs font-medium text-navy/70 hover:border-navy/35"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {status === 'error' && (
            <Notice tone="danger">
              RakshaPay could not start up in this browser ({loadError}). Nothing can be checked
              until it does — this page will not guess at an answer.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          {!isSupabaseConfigured && status === 'ready' && (
            <Notice tone="muted">
              Community reports are not connected on this deployment, so verdicts do not include
              what other people have reported. Everything else works exactly as normal.
            </Notice>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {rejected ? (
          <RejectedPayload check={rejected} payload={payload} />
        ) : detail ? (
          <>
            <VerdictCard
              detail={detail}
              subject={subject}
              kind={mode === 'link' ? 'link' : mode === 'sms' ? 'message' : 'payment'}
            />
            {detail.links && detail.links.length > 0 && <LinkFindings links={detail.links} />}
            {currentVpa && <ReportPanel vpa={currentVpa} />}
          </>
        ) : (
          <EmptyState status={status} />
        )}
      </div>
    </div>
  );
}

function QrDropzone({ onFile, decoding }: { onFile: (file: File) => void; decoding: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onPaste={(e) => {
        const file = Array.from(e.clipboardData.files)[0];
        if (file) onFile(file);
      }}
      className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
        dragging ? 'border-navy bg-navy/5' : 'border-navy/20 bg-canvas'
      }`}
    >
      <QrIcon className="mx-auto h-8 w-8 text-navy/40" />
      <p className="mt-2 text-sm font-semibold">
        {decoding ? 'Reading the image…' : 'Drop a QR screenshot here'}
      </p>
      <p className="mt-1 text-xs text-muted">
        Decoded in this tab with a local decoder — the image is never uploaded.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="btn-ghost mt-3 px-4 py-2 text-xs"
      >
        Choose an image
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Shown instead of a verdict when the QR is real but is not a payment. The
 * distinction matters: refusing to answer is a different statement from "Safe",
 * and collapsing the two is how a tool ends up implying a phishing link is fine.
 */
function RejectedPayload({ check, payload }: { check: QrPayloadCheck; payload: string }) {
  return (
    <div className="card border-caution/25 bg-caution-bg">
      <span className="pill bg-caution text-white">
        <AlertIcon className="h-3.5 w-3.5" />
        Not scored
      </span>

      <h2 className="mt-3 font-display text-xl font-bold leading-tight text-caution">
        {check.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-navy/80">{check.detail}</p>

      {payload.trim().length > 0 && (
        <div className="mt-4">
          <p className="label">What the QR actually contained</p>
          <p className="max-h-32 overflow-auto break-all rounded-xl bg-surface px-4 py-3 font-mono text-xs">
            {payload.trim().slice(0, 500)}
            {payload.trim().length > 500 ? '…' : ''}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        We would rather show you nothing than a score that looks authoritative and answers the
        wrong question. If you expected a payment QR here, that mismatch is itself worth pausing
        over.
      </p>
    </div>
  );
}

function EmptyState({ status }: { status: 'idle' | 'loading' | 'ready' | 'error' }) {
  return (
    <div className="card border-dashed">
      <h2 className="font-display text-lg font-bold">Your verdict appears here</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Paste a payment QR, a UPI ID, a message or a link and RakshaPay will tell you what it makes
        of it, with the reasons in plain language. The checking happens inside this browser tab, so
        nothing you paste is sent anywhere.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {status === 'ready'
          ? 'Ready. Nothing you check leaves your browser.'
          : status === 'error'
            ? 'RakshaPay could not start up in this browser.'
            : 'Getting ready…'}
      </p>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'danger' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'danger'
      ? 'border-danger-border bg-danger-bg text-danger'
      : 'border-navy/10 bg-canvas text-muted';
  return (
    <p className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</p>
  );
}
