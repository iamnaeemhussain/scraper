import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckoutModal } from '../components/CheckoutModal';
import { StoreContext } from '../components/Layout';
import { api, Bundle, CompatibleDevice, formatPkr } from '../lib/api';

const BRANDS = [
  { name: 'Apple', glyph: 'A' },
  { name: 'Samsung', glyph: 'S' },
  { name: 'Google', glyph: 'G' },
  { name: 'Xiaomi', glyph: 'Mi' },
  { name: 'Huawei', glyph: 'H' },
  { name: 'Motorola', glyph: 'M' },
  { name: 'OnePlus', glyph: '1+' },
  { name: 'Oppo', glyph: 'O' },
  { name: 'Sony', glyph: 'X' },
  { name: 'Honor', glyph: 'Hn' },
];

const FAQS = [
  {
    q: 'What is an eSIM?',
    a: 'An eSIM is a digital SIM built directly into your phone. It lets you activate a mobile data plan by scanning a QR code — no physical plastic SIM card required.',
  },
  {
    q: 'How do I buy a Pak-Tel plan?',
    a: 'Pick any plan above, tap "Get this plan ↗", enter your email address, and complete payment in PKR via DPay. No account creation is required — your eSIM QR code is delivered automatically to your email as soon as payment succeeds.',
  },
  {
    q: 'How quickly will I receive my eSIM?',
    a: 'Immediately after payment confirmation! Once DPay confirms payment.succeeded, our system provisions your eSIM and delivers the QR code and one-tap install link straight to your email via Mailjet (and right on your order receipt page).',
  },
  {
    q: 'Do Pak-Tel plans include calls and SMS?',
    a: 'These are data-only eSIM plans. Voice and SMS are not included unless explicitly stated on a plan. You can keep using WhatsApp, FaceTime, and all internet-based calling apps over your Pak-Tel data connection.',
  },
  {
    q: 'How do I activate my eSIM?',
    a: 'On a compatible unlocked phone, open Settings → Mobile Data (or Connections → SIM Manager), choose Add eSIM, and scan the QR code sent to your email. Set Pak-Tel as your mobile data line and enable Data Roaming if prompted.',
  },
  {
    q: 'Can I reload my eSIM without scanning a new QR code?',
    a: 'Yes! Plans marked "Reloadable" can be topped up anytime from our eSIM Top-up page using your 19–20 digit ICCID.',
  },
  {
    q: 'Will it work on my phone?',
    a: 'Use the Compatibility Checker above to search your model across 10 major brands, or message us on WhatsApp before ordering if you would like our team to double-check your exact variant.',
  },
];

type DataFilter = 'all' | 'under1' | '1to5' | '5to10' | 'over10';
type SortMode = 'recommended' | 'price_asc' | 'price_desc' | 'data_asc' | 'data_desc';

export function StorefrontPage() {
  const storeConfig = useContext(StoreContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataFilter, setDataFilter] = useState<DataFilter>('all');
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);

  // Compatibility checker state
  const [deviceQuery, setDeviceQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [deviceResults, setDeviceResults] = useState<CompatibleDevice[] | null>(null);
  const [checkedLabel, setCheckedLabel] = useState<string>('');

  // FAQ accordion
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const paymentCancelled = searchParams.get('payment') === 'cancelled';

  useEffect(() => {
    setLoading(true);
    api
      .getBundles()
      .then((rows) => setBundles(rows))
      .catch(() => setBundles([]))
      .finally(() => setLoading(false));
  }, []);

  const countries = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bundles) {
      map.set(b.countryCode, b.countryName);
    }
    return Array.from(map.entries());
  }, [bundles]);

  const filteredBundles = useMemo(() => {
    let list = [...bundles];
    if (countryFilter !== 'ALL') {
      list = list.filter((b) => b.countryCode === countryFilter);
    }
    if (dataFilter === 'under1') {
      list = list.filter((b) => !b.unlimited && b.dataMb < 1024);
    } else if (dataFilter === '1to5') {
      list = list.filter((b) => !b.unlimited && b.dataMb >= 1024 && b.dataMb <= 5120);
    } else if (dataFilter === '5to10') {
      list = list.filter((b) => !b.unlimited && b.dataMb > 5120 && b.dataMb <= 10240);
    } else if (dataFilter === 'over10') {
      list = list.filter((b) => b.unlimited || b.dataMb > 10240);
    }

    if (sortMode === 'price_asc') {
      list.sort((a, b) => a.pricePkr - b.pricePkr);
    } else if (sortMode === 'price_desc') {
      list.sort((a, b) => b.pricePkr - a.pricePkr);
    } else if (sortMode === 'data_asc') {
      list.sort((a, b) => a.dataMb - b.dataMb);
    } else if (sortMode === 'data_desc') {
      list.sort((a, b) => b.dataMb - a.dataMb);
    } else {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return list;
  }, [bundles, countryFilter, dataFilter, sortMode]);

  async function handleDeviceSearch(e?: React.FormEvent, brandOverride?: string) {
    if (e) e.preventDefault();
    const b = brandOverride !== undefined ? brandOverride : selectedBrand;
    const q = brandOverride !== undefined ? '' : deviceQuery.trim();
    if (!b && !q) {
      setDeviceResults(null);
      setCheckedLabel('');
      return;
    }
    try {
      const res = await api.searchDevices(q || undefined, b || undefined);
      setDeviceResults(res.devices);
      setCheckedLabel(b || q);
    } catch {
      setDeviceResults([]);
      setCheckedLabel(b || q);
    }
  }

  const tickerText =
    storeConfig.storeNotice ||
    "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶";

  const waSupportUrl = `https://wa.me/${storeConfig.supportWhatsapp}?text=${encodeURIComponent(
    'Hi Pak-Tel, can you check my phone for eSIM support?',
  )}`;

  return (
    <div>
      {/* Scrolling Updates Ticker below fixed header */}
      <div className="pt-ticker">
        <div className="pt-ticker-label">
          <span className="w-2 h-2 rounded-full bg-[#071322] border border-[#071322]" />
          Pak-Tel / updates
        </div>
        <div className="flex-1 overflow-hidden flex items-center">
          <div className="pt-ticker-track text-xs md:text-sm text-white/90 font-medium">
            <span className="px-8 whitespace-nowrap">{tickerText}</span>
            <span className="px-8 whitespace-nowrap">{tickerText}</span>
            <span className="px-8 whitespace-nowrap">{tickerText}</span>
            <span className="px-8 whitespace-nowrap">{tickerText}</span>
          </div>
        </div>
      </div>

      {/* Payment Cancelled Banner (matching pak-tel.com) */}
      {paymentCancelled && (
        <div className="bg-[#ffad71] text-[#071322] px-4 py-3 text-xs sm:text-sm font-semibold">
          <div className="pt-container flex items-center justify-between gap-4">
            <span>
              Payment cancelled — you have not been charged. Your plan is still available whenever
              you are ready.
            </span>
            <button
              type="button"
              onClick={() => {
                searchParams.delete('payment');
                setSearchParams(searchParams);
              }}
              className="font-bold px-2 py-0.5 rounded hover:bg-[#071322]/10"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Hero Section matching pak-tel.com */}
      <section className="relative overflow-hidden bg-[#071322] text-white pt-14 pb-20 md:pt-20 md:pb-28">
        <div className="pt-hero-grid absolute inset-0 pointer-events-none" />
        <div
          className="absolute -top-48 right-[15%] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: 'rgba(109, 227, 193, 0.09)',
            boxShadow: '0 0 130px rgba(109, 227, 193, 0.09)',
          }}
        />
        <div
          className="absolute -bottom-48 -right-24 w-[460px] h-[460px] rounded-full pointer-events-none"
          style={{
            background: 'rgba(189, 184, 255, 0.09)',
            boxShadow: '0 0 130px rgba(189, 184, 255, 0.1)',
          }}
        />

        <div className="pt-container relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2.5 font-mono-pt text-[11px] uppercase tracking-[0.11em] text-[#ecf6ff]/65">
              <span className="pt-live-dot" />
              Pak-Tel / digital data
            </div>

            <h1 className="font-display text-5xl sm:text-6xl xl:text-[82px] font-semibold tracking-[-0.065em] leading-[0.95] mt-6">
              Your data.{' '}
              <span className="text-[#c8ff43] block sm:inline">On your terms.</span>
            </h1>

            <p className="mt-7 text-base sm:text-lg text-[#e7f2fa]/70 max-w-xl leading-relaxed">
              Flexible eSIM data for Pakistan and beyond. No store queues, no tiny SIM trays, no
              account signups — pay in PKR, receive your QR code by email, scan, and get on with
              your day.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <a href="#plans" className="pt-btn pt-btn--lime">
                Shop data plans ↗
              </a>
              <Link to="/my-esim" className="pt-btn pt-btn--ghost-light">
                eSIM Top-up ↗
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white/75 hover:text-[#c8ff43]"
              >
                See how it works ↓
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-5 text-xs text-white/65 font-mono-pt">
              <span className="inline-flex items-center gap-2">
                <span className="text-[#c8ff43]">✓</span> Instant QR delivery via Email
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="text-[#c8ff43]">✓</span> Data-first, always
              </span>
            </div>

            <div className="mt-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-4 max-w-lg">
              <div>
                <strong className="block font-display text-2xl sm:text-3xl text-white">100%</strong>
                <span className="text-xs text-white/55">digital setup</span>
              </div>
              <div>
                <strong className="block font-display text-2xl sm:text-3xl text-[#c8ff43]">
                  &lt; 2 min
                </strong>
                <span className="text-xs text-white/55">automated email QR</span>
              </div>
              <div>
                <strong className="block font-display text-2xl sm:text-3xl text-white">24/7</strong>
                <span className="text-xs text-white/55">WhatsApp support</span>
              </div>
            </div>
          </div>

          {/* Right-hand interactive eSIM Phone Card */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-sm rounded-[30px] border border-white/15 bg-[#10223a]/85 backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between text-[11px] font-mono-pt text-white/65 pb-4 border-b border-white/10">
                <span>9:41</span>
                <span className="inline-flex items-center gap-1.5 text-[#c8ff43]">
                  <span className="pt-live-dot" /> PK • 5G / 4G LTE
                </span>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <img src="/ptlogo.png" alt="Pak-Tel" className="h-11 w-auto object-contain" />
                <span className="rounded-full bg-[#c8ff43]/15 border border-[#c8ff43]/40 px-3 py-1 font-mono-pt text-[10px] font-bold uppercase text-[#c8ff43]">
                  PAK-TEL ESIM ACTIVE
                </span>
              </div>

              <div className="mt-6 rounded-2xl bg-[#071322] border border-white/10 p-5">
                <p className="font-mono-pt text-[10px] uppercase tracking-wider text-white/50">
                  Live Data Balance
                </p>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="font-display text-5xl font-semibold tracking-tight text-white">
                      15.0
                    </span>
                    <span className="ml-1.5 font-mono-pt text-xs text-[#c8ff43]">GB</span>
                  </div>
                  <span className="font-mono-pt text-xs text-white/60">30 days • 100%</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-[#6de3c1] to-[#c8ff43]" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
                  <span className="font-mono-pt text-[10px] text-[#c8ff43] block">⌁ eSIM READY</span>
                  <strong className="text-xs text-white mt-1 block">Delivered on payment</strong>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
                  <span className="font-mono-pt text-[10px] text-[#6de3c1] block">↗ RELOADABLE</span>
                  <strong className="text-xs text-white mt-1 block">Top up via ICCID</strong>
                </div>
              </div>

              <p className="mt-5 text-center text-xs italic text-white/55">
                “Connectivity, without the complicated bit.” —{' '}
                <strong className="not-italic text-white/80">Pak-Tel promise</strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans / Live Inventory Section matching pak-tel.com */}
      <section id="plans" className="py-20 md:py-28 bg-[#f5f6f1]">
        <div className="pt-container">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 font-mono-pt text-[10px] uppercase tracking-[0.11em] text-[#071322]/60">
                <span className="w-2 h-2 rounded-full bg-[#071322]" />
                Plans / live inventory
              </div>
              <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.06em] leading-[0.96] mt-4 text-[#071322]">
                Pick a plan,{' '}
                <span className="italic font-normal text-[#4b6b16]">not a compromise.</span>
              </h2>
              <p className="mt-4 text-sm sm:text-base text-[#071322]/65 max-w-xl">
                From a quick daily trial to unlimited 30-day streaming, choose the amount that fits
                your day. Pay in PKR and receive your QR code straight in your inbox.
              </p>
            </div>

            <div className="inline-flex items-center gap-2.5 self-start md:self-auto rounded-full bg-[#071322] text-white px-4 py-2 font-mono-pt text-[10px] uppercase tracking-wider">
              <span className="pt-live-dot" />
              Live pricing synced · {bundles.length} plans
            </div>
          </div>

          {/* Filter Tabs & Sort Bar */}
          <div className="mt-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[#071322]/12">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', 'All plans'],
                  ['under1', 'Under 1 GB'],
                  ['1to5', '1–5 GB'],
                  ['5to10', '5–10 GB'],
                  ['over10', '10 GB+ / Unlimited'],
                ] as [DataFilter, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDataFilter(id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                    dataFilter === id
                      ? 'bg-[#071322] text-[#c8ff43]'
                      : 'bg-white border border-[#071322]/15 text-[#071322]/75 hover:border-[#071322]'
                  }`}
                >
                  {label}
                </button>
              ))}

              {countries.length > 1 && (
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  aria-label="Filter by country"
                  className="ml-1 rounded-full bg-white border border-[#071322]/20 px-3.5 py-2 text-xs font-bold text-[#071322]"
                >
                  <option value="ALL">All Destinations ({countries.length})</option>
                  {countries.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-xs">
              <span className="font-mono-pt uppercase text-[10px] text-[#071322]/55">Sort by</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-lg bg-white border border-[#071322]/20 px-3 py-2 text-xs font-bold text-[#071322] outline-none"
              >
                <option value="recommended">Recommended</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="data_asc">Data: low to high</option>
                <option value="data_desc">Data: high to low</option>
              </select>
            </div>
          </div>

          {/* Plan Cards Grid matching pak-tel.com */}
          {loading ? (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-[460px] rounded-[18px] bg-white/70 border border-[#071322]/10 animate-pulse"
                />
              ))}
            </div>
          ) : filteredBundles.length === 0 ? (
            <div className="mt-8 rounded-[18px] border border-dashed border-[#071322]/25 p-14 text-center">
              <p className="text-sm text-[#071322]/65 mb-4">
                No plans match this filter right now.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDataFilter('all');
                  setCountryFilter('ALL');
                }}
                className="text-xs font-bold underline"
              >
                Reset plan filters
              </button>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBundles.map((plan, idx) => {
                const isPopular =
                  (plan.badge || '').toLowerCase().includes('popular') || idx < 4 && dataFilter === 'all' && sortMode === 'recommended' && Boolean(plan.badge?.toLowerCase().includes('popular'));
                const discount =
                  plan.originalPricePkr && plan.originalPricePkr > plan.pricePkr
                    ? Math.round(
                        ((plan.originalPricePkr - plan.pricePkr) / plan.originalPricePkr) * 100,
                      )
                    : 0;
                const displayNumber = String(idx + 1).padStart(2, '0');

                return (
                  <article
                    key={plan.id}
                    className={`pt-plan-card ${isPopular ? 'is-popular' : ''}`}
                  >
                    {/* Card Top Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono-pt text-[11px] font-bold px-2.5 py-1 rounded-md ${
                            isPopular
                              ? 'bg-white/10 text-[#c8ff43]'
                              : 'bg-[#071322]/8 text-[#071322]'
                          }`}
                        >
                          {displayNumber}
                        </span>
                        <span
                          className={`font-mono-pt text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold ${
                            isPopular
                              ? 'bg-[#c8ff43]/15 text-[#c8ff43] border border-[#c8ff43]/35'
                              : 'bg-[#e9ebe4] text-[#071322]/75'
                          }`}
                        >
                          {plan.badge || (plan.reloadable ? 'Flexible data' : plan.countryName)}
                        </span>
                      </div>

                      {discount > 0 && (
                        <span
                          className={`font-mono-pt text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                            isPopular
                              ? 'border-[#c8ff43] text-[#c8ff43] bg-[#c8ff43]/10'
                              : 'border-[#071322]/20 text-[#071322] bg-[#c8ff43]/45'
                          }`}
                        >
                          SAVE {discount}% OFF
                        </span>
                      )}
                    </div>

                    {/* Plan Title & Big Metric */}
                    <div className="mt-5">
                      <p
                        className={`text-xs font-semibold ${
                          isPopular ? 'text-white/65' : 'text-[#071322]/60'
                        }`}
                      >
                        {plan.name} • {plan.countryName}
                      </p>
                      <div className="mt-2 flex items-end gap-2">
                        <strong className="font-display text-4xl sm:text-[44px] font-semibold tracking-[-0.07em] leading-none">
                          {plan.unlimited ? 'Unlimited' : plan.dataDisplay}
                        </strong>
                        <span
                          className={`font-mono-pt text-[10px] uppercase pb-1 ${
                            isPopular ? 'text-white/50' : 'text-[#071322]/50'
                          }`}
                        >
                          data
                        </span>
                      </div>
                    </div>

                    {/* Specs List */}
                    <dl
                      className={`mt-5 border-t text-xs ${
                        isPopular ? 'border-white/12' : 'border-[#071322]/10'
                      }`}
                    >
                      {[
                        ['Coverage', plan.coverage || '5G/4G/LTE'],
                        ['Plan type', plan.planType || 'Data only'],
                        [
                          'Validity period',
                          `${plan.validityDays} ${plan.validityDays === 1 ? 'Day' : 'Days'}`,
                        ],
                        ['Hotspot', plan.hotspotSupported ? 'Yes' : 'No'],
                        ['Plan activation', plan.activationType || 'Instant'],
                        ['Reloadable', plan.reloadable ? 'Yes' : 'No'],
                      ].map(([dt, dd]) => (
                        <div
                          key={dt}
                          className={`flex items-center justify-between py-2.5 border-b ${
                            isPopular ? 'border-white/12' : 'border-[#071322]/10'
                          }`}
                        >
                          <dt
                            className={`font-semibold ${
                              isPopular ? 'text-white/60' : 'text-[#071322]/60'
                            }`}
                          >
                            {dt}
                          </dt>
                          <dd
                            className={`font-mono-pt font-bold ${
                              isPopular ? 'text-white' : 'text-[#071322]'
                            }`}
                          >
                            {dd}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {/* Price & Get This Plan CTA */}
                    <div className="mt-auto pt-5 flex items-end justify-between gap-3 flex-wrap">
                      <div>
                        <span
                          className={`block font-mono-pt text-[9px] font-bold uppercase ${
                            isPopular ? 'text-white/45' : 'text-[#071322]/45'
                          }`}
                        >
                          Price (PKR)
                        </span>
                        {plan.originalPricePkr && plan.originalPricePkr > plan.pricePkr ? (
                          <span
                            className={`block font-mono-pt text-xs font-bold line-through decoration-2 ${
                              isPopular
                                ? 'text-white/65 decoration-[#ffad71]'
                                : 'text-[#071322]/60 decoration-[#db6e55]'
                            }`}
                          >
                            {formatPkr(plan.originalPricePkr)}
                          </span>
                        ) : null}
                        <strong
                          className={`font-display text-[26px] font-bold tracking-[-0.05em] leading-none mt-0.5 block ${
                            isPopular ? 'text-white' : 'text-[#071322]'
                          }`}
                        >
                          {formatPkr(plan.pricePkr)}
                        </strong>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedBundle(plan)}
                        className="pt-plan-btn"
                      >
                        Get this plan ↗
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#071322]/60">
            <p>
              ✓ All plans are data-only eSIMs. Reload plans marked{' '}
              <strong className="text-[#071322]">Reloadable</strong> anytime via ICCID.
            </p>
            <a href="#faq" className="font-bold text-[#071322] underline">
              Questions before you buy? ↗
            </a>
          </div>
        </div>
      </section>

      {/* How It Works Section (Dark Ink matching pak-tel.com) */}
      <section id="how" className="py-24 bg-[#071322] text-white">
        <div className="pt-container">
          <div className="inline-flex items-center gap-2 font-mono-pt text-[10px] uppercase tracking-[0.11em] text-white/60">
            <span className="pt-live-dot" />
            How it works
          </div>
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.06em] mt-4">
            Three steps. <span className="text-[#c8ff43]">Zero runaround.</span>
          </h2>
          <p className="mt-4 text-white/65 max-w-xl text-sm sm:text-base">
            Everything happens digitally on your phone. Pick your plan, pay in PKR, and scan your
            eSIM QR code from your email without leaving the sofa.
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                num: '01',
                badgeBg: 'bg-[#c8ff43]',
                icon: '⌁',
                title: 'Choose your data',
                desc: 'Pick the plan that feels right — whether you need a quick trial, 30 GB, or unlimited monthly data.',
              },
              {
                num: '02',
                badgeBg: 'bg-[#ffad71]',
                icon: '↗',
                title: 'Pay securely via DPay',
                desc: 'Enter your email address and pay in PKR from any Pakistani wallet or bank card. Zero account creation required.',
              },
              {
                num: '03',
                badgeBg: 'bg-[#6de3c1]',
                icon: '✓',
                title: 'Scan from email & connect',
                desc: 'Once payment succeeds, Mailjet delivers your eSIM QR code & one-tap install link straight to your inbox.',
              },
            ].map((s) => (
              <div
                key={s.num}
                className="relative rounded-[18px] border border-white/12 bg-white/[0.035] p-6 min-h-[260px] flex flex-col justify-between hover:border-[#c8ff43]/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono-pt text-xs text-white/45">{s.num}</span>
                  <span
                    className={`w-9 h-9 rounded-full ${s.badgeBg} text-[#071322] font-display font-bold grid place-items-center text-lg`}
                  >
                    {s.icon}
                  </span>
                </div>
                <div className="mt-12">
                  <h3 className="font-display text-2xl font-medium tracking-tight">{s.title}</h3>
                  <p className="mt-2.5 text-xs sm:text-sm text-white/60 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[18px] border border-[#c8ff43]/25 bg-[#c8ff43]/[0.07] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <strong className="font-display text-sm text-white block">Made for real life</strong>
              <span className="text-xs text-white/60">
                Keep your physical SIM for calls while Pak-Tel handles your high-speed data.
              </span>
            </div>
            <a href="#compatibility" className="text-xs font-bold text-[#c8ff43] underline">
              Check your phone ↗
            </a>
          </div>
        </div>
      </section>

      {/* Why Pak-Tel Section matching pak-tel.com */}
      <section id="why" className="py-24 bg-[#f5f6f1]">
        <div className="pt-container">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 font-mono-pt text-[10px] uppercase tracking-[0.11em] text-[#071322]/60">
                <span className="w-2 h-2 rounded-full bg-[#071322]" />
                Why Pak-Tel
              </div>
              <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.06em] mt-4">
                Small switch. <span className="italic font-normal text-[#4b6b16]">Big difference.</span>
              </h2>
            </div>
            <p className="text-sm text-[#071322]/65 max-w-sm">
              A better way to stay online is not another complicated app or user login. It’s a
              clean, flexible connection that gets out of your way.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5 rounded-[18px] bg-[#071322] text-white p-7 flex flex-col justify-between min-h-[290px]">
              <span className="font-mono-pt text-[10px] uppercase tracking-wider text-white/45">
                01 / FASTER
              </span>
              <div className="my-6 h-24 rounded-xl bg-gradient-to-r from-[#152b3c] to-[#244259] grid place-items-center">
                <span className="font-display text-6xl text-[#c8ff43]">↯</span>
              </div>
              <div>
                <h3 className="font-display text-2xl font-medium">Instant by design</h3>
                <p className="mt-2 text-xs sm:text-sm text-white/60 leading-relaxed">
                  Your plan arrives digitally via Mailjet the moment payment succeeds. No courier,
                  no store visit, no plastic card to lose.
                </p>
              </div>
            </div>

            <div className="md:col-span-3.5 md:col-span-4 rounded-[18px] bg-white border border-[#071322]/12 p-7 flex flex-col justify-between min-h-[290px]">
              <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/45">
                02 / FLEXIBLE
              </span>
              <div className="w-14 h-14 rounded-xl bg-[#c8ff43] text-[#071322] font-display text-3xl grid place-items-center my-6">
                ↗
              </div>
              <div>
                <h3 className="font-display text-2xl font-medium">Only pay for what you need</h3>
                <p className="mt-2 text-xs sm:text-sm text-[#071322]/65 leading-relaxed">
                  Light trial data or heavy 30-day streaming — reload your existing ICCID in two
                  taps whenever you run low.
                </p>
              </div>
            </div>

            <div className="md:col-span-3 rounded-[18px] bg-white border border-[#071322]/12 p-7 flex flex-col justify-between min-h-[290px]">
              <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#071322]/45">
                03 / SIMPLE
              </span>
              <div className="w-14 h-14 rounded-xl bg-[#ffad71] text-[#071322] font-display text-3xl grid place-items-center my-6">
                ⌁
              </div>
              <div>
                <h3 className="font-display text-2xl font-medium">No physical SIM</h3>
                <p className="mt-2 text-xs sm:text-sm text-[#071322]/65 leading-relaxed">
                  Leave your main number where it is. Add Pak-Tel data without opening the SIM tray.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compatibility Checker on Lilac (#bdb8ff) matching pak-tel.com */}
      <section id="compatibility" className="py-24 bg-[#bdb8ff] text-[#071322]">
        <div className="pt-container grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 font-mono-pt text-[10px] uppercase tracking-[0.11em] text-[#071322]/70">
              <span className="w-2 h-2 rounded-full bg-[#071322]" />
              Compatibility checker
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.06em] leading-[0.96] mt-4">
              Is your phone <span className="italic font-normal text-[#4c477d]">eSIM ready?</span>
            </h2>
            <p className="mt-5 text-sm sm:text-base text-[#071322]/70 leading-relaxed">
              Most recent flagship and mid-range phones are good to go. Search your model or browse
              a brand to get a quick answer.
            </p>
            <div className="mt-6 pt-4 border-t border-[#071322]/20 text-xs text-[#071322]/65">
              <strong>Note:</strong> Support can vary by exact model, region, and carrier lock.
              Dial <code className="font-mono-pt font-bold">*#06#</code> to confirm an EID number
              appears in your phone settings.
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-[28px] border border-[#071322]/20 bg-white/60 backdrop-blur-md p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between font-mono-pt text-[10px] uppercase tracking-wider">
                <span className="inline-flex items-center gap-2 font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#5b8b4f]" /> Device lookup
                </span>
                <span className="text-[#071322]/55">10 brands</span>
              </div>

              <form onSubmit={(e) => handleDeviceSearch(e)} className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={deviceQuery}
                  onChange={(e) => {
                    setDeviceQuery(e.target.value);
                    if (selectedBrand) setSelectedBrand('');
                  }}
                  placeholder="Search your phone model (e.g. iPhone 15, Galaxy S24, Pixel 8)…"
                  className="flex-1 rounded-xl border border-[#071322]/20 bg-white/80 px-4 py-3 text-xs sm:text-sm outline-none focus:border-[#071322]"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#071322] text-white px-5 py-3 text-xs font-bold hover:bg-[#c8ff43] hover:text-[#071322] transition-colors"
                >
                  Check
                </button>
              </form>

              {deviceResults !== null && (
                <div
                  className={`mt-4 rounded-xl p-4 text-xs ${
                    deviceResults.length > 0
                      ? 'bg-[#c8ff43]/40 border border-[#071322]/15'
                      : 'bg-[#ffad71]/35 border border-[#071322]/15'
                  }`}
                >
                  {deviceResults.length > 0 ? (
                    <div className="space-y-2">
                      <strong className="font-display text-sm block">
                        ✓ {deviceResults.length} compatible model group
                        {deviceResults.length > 1 ? 's' : ''} for “{checkedLabel}”
                      </strong>
                      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                        {deviceResults.map((d, i) => (
                          <div
                            key={i}
                            className="rounded-lg bg-white/75 px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                          >
                            <span className="font-bold">
                              {d.brand} — {d.model}
                            </span>
                            <span className="text-[11px] text-[#071322]/65">{d.notes}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <strong className="font-display text-sm block">
                        Model “{checkedLabel}” wasn’t found in our quick list
                      </strong>
                      <span className="text-[#071322]/75">
                        Check Settings → Mobile Data → Add eSIM, or{' '}
                        <a
                          href={waSupportUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold underline"
                        >
                          ask us on WhatsApp ↗
                        </a>
                        .
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between font-mono-pt text-[10px] uppercase text-[#071322]/60">
                <span>Browse by brand</span>
                <span>Tap to explore</span>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {BRANDS.map((b) => {
                  const active = selectedBrand === b.name;
                  return (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => {
                        setSelectedBrand(b.name);
                        setDeviceQuery('');
                        handleDeviceSearch(undefined, b.name);
                      }}
                      className={`rounded-xl border p-3 flex flex-col items-center justify-center gap-1.5 text-xs font-bold transition-colors ${
                        active
                          ? 'bg-[#071322] text-[#c8ff43] border-[#071322]'
                          : 'bg-white/70 border-[#071322]/15 text-[#071322] hover:bg-white'
                      }`}
                    >
                      <span className="font-display text-base font-bold">{b.glyph}</span>
                      <span className="text-[11px]">{b.name}</span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-[11px] text-[#071322]/65">
                Not seeing your model?{' '}
                <a
                  href={waSupportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline text-[#071322]"
                >
                  Ask us on WhatsApp ↗
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section matching pak-tel.com */}
      <section id="faq" className="py-24 bg-[#f5f6f1]">
        <div className="pt-container grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 font-mono-pt text-[10px] uppercase tracking-[0.11em] text-[#071322]/60">
              <span className="w-2 h-2 rounded-full bg-[#071322]" />
              FAQ / the useful bits
            </div>
            <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.06em] mt-4">
              Questions? <span className="italic font-normal text-[#4b6b16]">We’ve got data.</span>
            </h2>
            <p className="mt-4 text-sm text-[#071322]/65 max-w-sm">
              Still unsure? Send us a message and a real person from the Pak-Tel team will help you
              out.
            </p>
            <a
              href={waSupportUrl}
              target="_blank"
              rel="noreferrer"
              className="pt-btn pt-btn--dark mt-6"
            >
              Chat with Pak-Tel ↗
            </a>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {FAQS.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-[#071322]/12 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 font-display text-base sm:text-lg font-semibold text-[#071322]"
                  >
                    <span>{item.q}</span>
                    <span className="w-7 h-7 rounded-full bg-[#f5f6f1] grid place-items-center text-sm shrink-0">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-[#071322]/70 leading-relaxed border-t border-[#071322]/8 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom Ready CTA */}
      <section className="py-20 bg-[#071322] text-white border-t border-white/10">
        <div className="pt-container text-center max-w-2xl">
          <p className="font-mono-pt text-[10px] uppercase tracking-[0.12em] text-[#c8ff43]">
            Your next signal is closer than you think
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.06em] mt-3">
            Ready to get <span className="text-[#c8ff43]">properly connected?</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-white/65">
            Choose your data, complete PKR checkout, and scan your eSIM QR code from your email in
            minutes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3.5">
            <a href="#plans" className="pt-btn pt-btn--lime">
              Browse eSIM plans ↗
            </a>
            <Link to="/my-esim" className="pt-btn pt-btn--ghost-light">
              Reload existing ICCID ↗
            </Link>
          </div>
        </div>
      </section>

      <CheckoutModal
        bundle={selectedBundle}
        onClose={() => setSelectedBundle(null)}
      />
    </div>
  );
}
