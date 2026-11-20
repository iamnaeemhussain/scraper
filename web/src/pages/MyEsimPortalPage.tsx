import React, { useContext, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckoutModal } from '../components/CheckoutModal';
import { StoreContext } from '../components/Layout';
import { api, Bundle, formatBytes, formatPkr, ProvisionedEsim } from '../lib/api';

export function MyEsimPortalPage() {
  const storeConfig = useContext(StoreContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialIccid = (searchParams.get('iccid') || '').replace(/\D/g, '');
  const [iccidInput, setIccidInput] = useState(initialIccid);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loadedEsim, setLoadedEsim] = useState<ProvisionedEsim | null>(null);
  const [currentBundle, setCurrentBundle] = useState<Bundle | null>(null);
  const [reloadPlans, setReloadPlans] = useState<Bundle[]>([]);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      amountPkr: number;
      status: string;
      planName: string;
      dataDisplay: string;
      createdAt: string;
    }>
  >([]);

  const [topupBundle, setTopupBundle] = useState<Bundle | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api
      .getBundles({ reloadOnly: true })
      .then(setReloadPlans)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialIccid.length >= 18) {
      runLookup(initialIccid);
    }
  }, []);

  async function runLookup(rawIccid: string) {
    const clean = rawIccid.replace(/\D/g, '');
    if (clean.length < 18 || clean.length > 22) {
      setError('Please enter a valid 18 to 22 digit numeric ICCID.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.lookupIccid(clean);
      setLoadedEsim(res.esim);
      setCurrentBundle(res.currentBundle);
      if (res.compatibleReloadBundles?.length) {
        setReloadPlans(res.compatibleReloadBundles);
      }
      setHistory(res.history || []);
      setSearchParams({ iccid: clean }, { replace: true });
    } catch (err: any) {
      setLoadedEsim(null);
      setError(
        err?.message ||
          'No eSIM found for that ICCID. Double-check your 19–20 digit number in Settings → Mobile Data.',
      );
    } finally {
      setLoading(false);
    }
  }

  function copyText(label: string, val: string) {
    navigator.clipboard.writeText(val);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const cleanDigits = iccidInput.replace(/\D/g, '');
  const isValidLen = cleanDigits.length >= 18 && cleanDigits.length <= 22;

  const totalBytesNum = Number(loadedEsim?.totalBytes || 0);
  const remBytesNum = Number(loadedEsim?.remainingBytes || 0);
  const pctRemaining =
    totalBytesNum > 0 ? Math.min(100, Math.max(0, Math.round((remBytesNum / totalBytesNum) * 100))) : 0;

  return (
    <div className="pt-[84px]">
      {/* Dark Ink Hero matching my.pak-tel.com */}
      <section className="relative overflow-hidden bg-[#071322] text-white py-16 md:py-24">
        <div className="pt-hero-grid absolute inset-0 pointer-events-none" />
        <div className="pt-container relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2.5 font-mono-pt text-[10px] uppercase tracking-[0.11em] text-white/60">
              <span className="pt-live-dot" />
              my Pak-Tel / self Top-up service
            </div>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-semibold tracking-[-0.065em] leading-[0.95] mt-5">
              Your eSIM. <span className="text-[#c8ff43]">At a glance.</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-[#e7f2fa]/70 max-w-md leading-relaxed">
              Enter your ICCID to see your remaining data, expiry date, QR code, and activation
              status — then top up in a couple of taps.
            </p>
          </div>

          <div className="lg:col-span-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runLookup(cleanDigits);
              }}
              className="rounded-[20px] border border-white/15 bg-[#12273b]/85 backdrop-blur-xl p-6 sm:p-7 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-pt text-[11px] uppercase tracking-wider text-white/70">
                  ICCID lookup
                </span>
                <span
                  className={`font-mono-pt text-[11px] ${
                    isValidLen ? 'text-[#c8ff43]' : 'text-white/45'
                  }`}
                >
                  {cleanDigits.length} / 20
                </span>
              </div>

              <label
                htmlFor="iccid-input"
                className="block font-display text-xl font-semibold mt-4 mb-2.5"
              >
                Your eSIM ICCID
              </label>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="iccid-input"
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={iccidInput}
                  onChange={(e) => setIccidInput(e.target.value.replace(/[^\d\s]/g, '').slice(0, 24))}
                  placeholder="899201..."
                  className="flex-1 rounded-xl border border-white/20 bg-[#071322] px-4 py-3.5 font-mono-pt text-sm text-white placeholder:text-white/35 outline-none focus:border-[#c8ff43]"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="pt-btn pt-btn--lime shrink-0"
                >
                  {loading ? 'Checking…' : 'Check eSIM ↗'}
                </button>
              </div>

              <p className="mt-3 text-xs text-white/55 leading-relaxed">
                Find it in <strong className="text-white/85">Settings → Mobile Data → your Pak-Tel eSIM</strong>,
                or in the Mailjet email we sent with your QR code. Digits only.
              </p>

              {error && (
                <div className="mt-4 rounded-xl bg-[#ff7a6b]/20 border border-[#ff7a6b]/60 px-4 py-3 text-xs text-[#ffd2cc]">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Live eSIM Details Section */}
      <section className="py-16 bg-[#f5f6f1]">
        <div className="pt-container">
          {!loadedEsim ? (
            <div className="rounded-[22px] bg-white border border-[#071322]/12 p-10 text-center max-w-2xl mx-auto">
              <span className="font-mono-pt text-[10px] uppercase tracking-widest text-[#071322]/50">
                eSIM / live details
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-2">
                No eSIM loaded yet
              </h2>
              <p className="mt-2 text-sm text-[#071322]/65">
                Enter your 19 or 20 digit ICCID above to load your live balance, QR code, and
                compatible top-up options.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/55">
                    eSIM / live details
                  </span>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold font-mono-pt mt-1 break-all">
                    ICCID {loadedEsim.iccid}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => runLookup(loadedEsim.iccid)}
                  disabled={loading}
                  className="pt-btn pt-btn--dark pt-btn--small"
                >
                  ↻ Recheck balance
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Data Balance Card */}
                <div className="rounded-[20px] bg-[#071322] text-white p-6 flex flex-col justify-between">
                  <div>
                    <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#c8ff43]">
                      Data balance
                    </span>
                    <div className="mt-3">
                      <strong className="font-display text-4xl font-semibold">
                        {formatBytes(loadedEsim.remainingBytes)}
                      </strong>
                      <span className="ml-2 text-xs text-white/60">remaining</span>
                    </div>
                    <div className="mt-4 h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#6de3c1] to-[#c8ff43]"
                        style={{ width: `${pctRemaining}%` }}
                      />
                    </div>
                  </div>

                  <dl className="mt-6 pt-4 border-t border-white/10 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-white/55">Used</dt>
                      <dd className="font-mono-pt font-bold">{formatBytes(loadedEsim.usedBytes)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/55">Remaining</dt>
                      <dd className="font-mono-pt font-bold text-[#c8ff43]">
                        {formatBytes(loadedEsim.remainingBytes)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/55">Plan total</dt>
                      <dd className="font-mono-pt font-bold">{formatBytes(loadedEsim.totalBytes)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Plan & Status Card */}
                <div className="rounded-[20px] bg-white border border-[#071322]/12 p-6 flex flex-col justify-between">
                  <div>
                    <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/55">
                      Plan &amp; status
                    </span>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#c8ff43]/45 px-3 py-1 font-mono-pt text-xs font-bold text-[#071322]">
                      <span className="w-2 h-2 rounded-full bg-[#071322]" />
                      {loadedEsim.status}
                    </div>
                  </div>

                  <dl className="mt-6 space-y-2.5 text-xs border-t border-[#071322]/10 pt-4">
                    <div className="flex justify-between">
                      <dt className="text-[#071322]/60 font-semibold">Current plan</dt>
                      <dd className="font-bold">{currentBundle?.name || 'Pak-Tel Data eSIM'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#071322]/60 font-semibold">Activated</dt>
                      <dd className="font-mono-pt">
                        {loadedEsim.activatedAt
                          ? new Date(loadedEsim.activatedAt).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#071322]/60 font-semibold">Expires</dt>
                      <dd className="font-mono-pt font-bold">
                        {loadedEsim.expiresAt
                          ? new Date(loadedEsim.expiresAt).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#071322]/60 font-semibold">Network</dt>
                      <dd className="font-mono-pt">5G / 4G LTE</dd>
                    </div>
                  </dl>
                </div>

                {/* QR & Install Link Card */}
                <div className="rounded-[20px] bg-white border border-[#071322]/12 p-6 flex flex-col justify-between">
                  <div>
                    <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/55">
                      QR &amp; install link
                    </span>
                    <p className="mt-2 text-xs text-[#071322]/65">
                      Scan in <strong>Settings → Mobile Data → Add eSIM</strong>.
                    </p>
                  </div>

                  {loadedEsim.qrDataUrl ? (
                    <div className="my-4 flex flex-col items-center">
                      <img
                        src={loadedEsim.qrDataUrl}
                        alt="eSIM QR"
                        className="w-36 h-36 rounded-xl border border-[#071322]/15 p-2 bg-white"
                      />
                    </div>
                  ) : (
                    <p className="my-4 text-xs text-[#071322]/55">
                      Need your QR resent?{' '}
                      <a
                        href={`https://wa.me/${storeConfig.supportWhatsapp}?text=${encodeURIComponent(
                          `Hi Pak-Tel, please help with ICCID ${loadedEsim.iccid}`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-bold"
                      >
                        Message us on WhatsApp ↗
                      </a>
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {loadedEsim.appleUniversalLink && (
                      <a
                        href={loadedEsim.appleUniversalLink}
                        className="pt-btn pt-btn--lime pt-btn--small flex-1"
                      >
                        Install on iPhone ↗
                      </a>
                    )}
                    {loadedEsim.lpa && (
                      <button
                        type="button"
                        onClick={() => copyText('lpa', loadedEsim.lpa!)}
                        className="pt-btn pt-btn--dark pt-btn--small"
                      >
                        {copiedField === 'lpa' ? 'Copied ✓' : 'Copy LPA'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top-up / Live Plan Sheet matching my.pak-tel.com */}
      <section className="py-16 bg-[#e9ebe4] border-t border-[#071322]/10">
        <div className="pt-container">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/60">
                Top-up / live plan sheet
              </span>
              <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.06em] mt-2">
                Need more data? <span className="italic font-normal text-[#4b6b16]">Top up.</span>
              </h2>
            </div>
            <span className="font-mono-pt text-xs text-[#071322]/65">
              Live pricing synced · {reloadPlans.length} reloadable plans
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {reloadPlans.map((plan, idx) => {
              const isPopular = Boolean(plan.badge?.toLowerCase().includes('popular'));
              const discount =
                plan.originalPricePkr && plan.originalPricePkr > plan.pricePkr
                  ? Math.round(
                      ((plan.originalPricePkr - plan.pricePkr) / plan.originalPricePkr) * 100,
                    )
                  : 0;

              return (
                <article
                  key={plan.id}
                  className={`pt-plan-card ${isPopular ? 'is-popular' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono-pt text-[11px] font-bold px-2.5 py-1 rounded-md ${
                        isPopular ? 'bg-white/10 text-[#c8ff43]' : 'bg-[#071322]/8 text-[#071322]'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')} • {plan.badge || 'Reloadable'}
                    </span>
                    {discount > 0 && (
                      <span
                        className={`font-mono-pt text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          isPopular
                            ? 'bg-[#c8ff43]/15 text-[#c8ff43]'
                            : 'bg-[#c8ff43]/55 text-[#071322]'
                        }`}
                      >
                        Save {discount}% off
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                    <strong className="font-display text-4xl font-semibold tracking-tight block mt-1">
                      {plan.unlimited ? 'Unlimited Data' : plan.dataDisplay}
                    </strong>
                    <p
                      className={`text-xs font-mono-pt mt-1 ${
                        isPopular ? 'text-white/60' : 'text-[#071322]/60'
                      }`}
                    >
                      {plan.validityDays} {plan.validityDays === 1 ? 'Day' : 'Days'} •{' '}
                      {plan.coverage} • Hotspot Yes
                    </p>
                  </div>

                  <div className="mt-auto pt-5 border-t border-current/10 flex items-end justify-between gap-3">
                    <div>
                      {plan.originalPricePkr && plan.originalPricePkr > plan.pricePkr ? (
                        <span className="block font-mono-pt text-xs line-through opacity-60">
                          {formatPkr(plan.originalPricePkr)}
                        </span>
                      ) : null}
                      <strong className="font-display text-2xl font-bold">
                        {formatPkr(plan.pricePkr)}
                      </strong>
                    </div>

                    {loadedEsim ? (
                      <button
                        type="button"
                        onClick={() => setTopupBundle(plan)}
                        className="pt-plan-btn"
                      >
                        Top up now ↗
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          setTimeout(() => inputRef.current?.focus(), 350);
                        }}
                        className="pt-plan-btn"
                      >
                        Enter ICCID ↗
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Transaction History */}
      {loadedEsim && (
        <section className="py-16 bg-[#f5f6f1]">
          <div className="pt-container">
            <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/55">
              History / this eSIM
            </span>
            <h2 className="font-display text-3xl font-semibold mt-2 mb-6">
              Transaction <span className="italic font-normal text-[#4b6b16]">history.</span>
            </h2>

            {history.length === 0 ? (
              <p className="text-sm text-[#071322]/60">
                No top-ups recorded yet on this ICCID.
              </p>
            ) : (
              <div className="rounded-2xl bg-white border border-[#071322]/12 overflow-hidden">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[#071322] text-white font-mono-pt text-[10px] uppercase">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#071322]/10">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-3 font-mono-pt text-xs">
                          {new Date(h.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {h.planName} {h.dataDisplay ? `(${h.dataDisplay})` : ''}
                        </td>
                        <td className="px-4 py-3 font-mono-pt font-bold">
                          {formatPkr(h.amountPkr)}
                        </td>
                        <td className="px-4 py-3 font-mono-pt text-xs font-bold">{h.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <CheckoutModal
        bundle={topupBundle}
        targetIccid={loadedEsim?.iccid || null}
        onClose={() => setTopupBundle(null)}
      />
    </div>
  );
}
