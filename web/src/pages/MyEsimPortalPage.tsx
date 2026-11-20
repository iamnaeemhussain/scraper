import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  Smartphone,
  Zap,
} from 'lucide-react';
import {
  apiFetch,
  EsimRecord,
  formatMbToReadable,
  formatPkr,
  PublicBundle,
} from '../lib/api';

export function MyEsimPortalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialIccid = searchParams.get('iccid') || '';
  const topupIdParam = searchParams.get('topup') || '';

  const [iccidInput, setIccidInput] = useState(initialIccid);
  const [esim, setEsim] = useState<EsimRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [topUpBanner, setTopUpBanner] = useState<string | null>(null);
  const [reloadingBundleId, setReloadingBundleId] = useState<string | null>(null);
  const [reloadEmail, setReloadEmail] = useState('');

  const performLookup = async (targetIccid: string) => {
    const clean = targetIccid.replace(/\s+/g, '').trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<EsimRecord>(`/api/esims/lookup/${encodeURIComponent(clean)}`);
      setEsim(data);
      setSearchParams({ iccid: clean }, { replace: true });
    } catch (err) {
      setEsim(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const verifyTopupThenLookup = async () => {
      if (topupIdParam) {
        try {
          const t = await apiFetch<{ status: string; bundleName: string }>(
            `/api/topups/${encodeURIComponent(topupIdParam)}`,
          );
          if (t.status === 'COMPLETED') {
            setTopUpBanner(`Top-Up Confirmed! ${t.bundleName} has been added to your eSIM.`);
          }
        } catch {
          // ignore
        }
      }
      if (initialIccid) {
        await performLookup(initialIccid);
      }
    };
    verifyTopupThenLookup();
  }, []);

  const copyText = (label: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTopUp = async (bundle: PublicBundle) => {
    if (!esim) return;
    setReloadingBundleId(bundle.id);
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await apiFetch<{ checkoutUrl: string }>('/api/topups', {
        method: 'POST',
        body: JSON.stringify({
          iccid: esim.iccid,
          bundleId: bundle.id,
          customerEmail: reloadEmail.trim() || undefined,
          successUrl: `${origin}/my-esim?iccid=${esim.iccid}`,
          cancelUrl: `${origin}/my-esim?iccid=${esim.iccid}`,
        }),
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setReloadingBundleId(null);
    }
  };

  const pctRemaining =
    esim && !esim.isUnlimited && esim.dataPackageMb && esim.dataPackageMb > 0
      ? Math.max(0, Math.min(100, Math.round(((esim.dataLeftMb ?? 0) / esim.dataPackageMb) * 100)))
      : 100;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-3">
          <QrCode className="w-3.5 h-3.5" />
          Self-Service eSIM Portal
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white">
          Check Balance, QR &amp; Reload Data
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Enter your 19–20 digit ICCID number (starts with <code className="text-emerald-300">89...</code>)
          to view live remaining data, retrieve your QR code, or top up via DPay.
        </p>
      </div>

      {/* ICCID Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          performLookup(iccidInput);
        }}
        className="max-w-xl mx-auto flex flex-col sm:flex-row gap-3 mb-10"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
          <input
            type="text"
            value={iccidInput}
            onChange={(e) => setIccidInput(e.target.value)}
            placeholder="Enter 19-digit ICCID (e.g. 8948650000...)"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm font-mono text-white"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Check eSIM
        </button>
      </form>

      {topUpBanner && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-medium text-center">
          {topUpBanner}
        </div>
      )}

      {error && (
        <div className="max-w-xl mx-auto mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300 text-center">
          {error}
        </div>
      )}

      {esim && (
        <div className="space-y-8">
          {/* Status & Usage Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl bg-slate-900/85 border border-slate-800 p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">ICCID</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-base sm:text-lg font-mono font-bold text-white">
                      {esim.iccid}
                    </span>
                    <button
                      onClick={() => copyText('iccid', esim.iccid)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Copy ICCID"
                    >
                      {copiedField === 'iccid' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    esim.isDeleted
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  Status: {esim.isDeleted ? 'Replaced / Deleted' : esim.statusQr}
                </span>
              </div>

              {/* Data Meter */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-200">
                    {esim.activePlanName || 'Active Data Plan'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {esim.planExpiredAt
                      ? `Valid until ${new Date(esim.planExpiredAt).toLocaleDateString()}`
                      : 'Ready to activate'}
                  </span>
                </div>

                {esim.isUnlimited ? (
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold text-emerald-400">
                      Unlimited Data
                    </span>
                    <span className="text-xs text-slate-400">
                      Used so far: {formatMbToReadable(esim.dataUsedMb)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-extrabold text-emerald-400">
                          {formatMbToReadable(esim.dataLeftMb)}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">
                          remaining of {formatMbToReadable(esim.dataPackageMb)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-300">{pctRemaining}%</span>
                    </div>
                    <div className="mt-3 h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                        style={{ width: `${pctRemaining}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Used: {formatMbToReadable(esim.dataUsedMb)}
                    </div>
                  </>
                )}
              </div>

              {/* Manual LPA & One-Tap Install */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Installation Credentials
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">LPA Activation String</div>
                    <div className="text-xs font-mono text-slate-200 truncate">
                      {esim.activationCode}
                    </div>
                  </div>
                  <button
                    onClick={() => copyText('lpa', esim.activationCode)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white shrink-0 flex items-center gap-1.5"
                  >
                    {copiedField === 'lpa' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy LPA
                      </>
                    )}
                  </button>
                </div>

                {esim.iosTapLink && (
                  <a
                    href={esim.iosTapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition"
                  >
                    <Smartphone className="w-4 h-4" />
                    1-Tap Install on iPhone (iOS 17.4+)
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* QR Code Card */}
            <div className="rounded-2xl bg-slate-900/85 border border-slate-800 p-6 flex flex-col items-center justify-center text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
                Scan eSIM QR Code
              </div>
              <div className="p-3 rounded-2xl bg-white shadow-lg">
                <img
                  src={esim.qrCodeDataUrl}
                  alt={`eSIM QR for ${esim.iccid}`}
                  className="w-48 h-48 object-contain"
                />
              </div>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Settings → Cellular / Mobile Data → <strong>Add eSIM</strong> → Use QR Code.
                Enable <strong>Data Roaming</strong> after installing.
              </p>
            </div>
          </div>

          {/* Instant Reload / Top-Up Bundles */}
          {!esim.isDeleted && esim.reloadableBundles && esim.reloadableBundles.length > 0 && (
            <div className="rounded-2xl bg-slate-900/85 border border-slate-800 p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-emerald-400" />
                    Instant Reload / Top-Up This eSIM
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Keep your existing QR installed — new data activates automatically on ICCID{' '}
                    <span className="font-mono text-slate-300">{esim.iccid}</span> after DPay
                    payment.
                  </p>
                </div>

                <input
                  type="email"
                  value={reloadEmail}
                  onChange={(e) => setReloadEmail(e.target.value)}
                  placeholder="Receipt email (optional)"
                  className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-white w-full sm:w-60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {esim.reloadableBundles.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{b.name}</span>
                        <span className="text-xs text-emerald-400 font-semibold">
                          {b.validityDays}d
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{b.dataLabel}</div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-lg font-extrabold text-emerald-400">
                        {formatPkr(b.pricePkr)}
                      </span>
                      <button
                        onClick={() => handleTopUp(b)}
                        disabled={reloadingBundleId === b.id}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                      >
                        {reloadingBundleId === b.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        Reload Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top-Up History */}
          {esim.topUpHistory && esim.topUpHistory.length > 0 && (
            <div className="rounded-2xl bg-slate-900/85 border border-slate-800 p-6">
              <h3 className="text-base font-bold text-white mb-4">Reload History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Bundle</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {esim.topUpHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 font-mono text-xs text-slate-300">{h.reference}</td>
                        <td className="py-2.5 text-white">{h.bundleName}</td>
                        <td className="py-2.5 text-emerald-400 font-semibold">
                          {formatPkr(h.amountPkr)}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              h.status === 'COMPLETED'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-400">
                          {new Date(h.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
