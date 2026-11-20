import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  Flame,
  Globe2,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react';
import { CheckoutModal } from '../components/CheckoutModal';
import {
  apiFetch,
  DeviceCategory,
  formatPkr,
  PublicBundle,
  StoreConfig,
} from '../lib/api';
import { useAuth } from '../lib/auth';

const CATEGORIES = [
  { id: 'all', label: 'All Plans' },
  { id: 'under1', label: 'Under 1 GB' },
  { id: '1to5', label: '1 – 5 GB' },
  { id: '5to10', label: '5 – 10 GB' },
  { id: '10plus', label: '10 GB+' },
  { id: 'unlimited', label: 'Unlimited' },
];

const FAQS = [
  {
    q: 'Does Pak-Tel eSIM work on Non-PTA / PTA-blocked iPhones & Androids?',
    a: 'Yes! Pak-Tel data eSIMs operate via international carrier roaming agreements on local 4G/LTE/5G networks in Pakistan, allowing non-PTA eSIM-compatible devices to enjoy fast mobile internet, WhatsApp calls, hotspot sharing, and apps without carrying a second device.',
  },
  {
    q: 'How fast do I receive my eSIM QR code after paying via DPay?',
    a: 'Immediately! As soon as DPay confirms your PKR payment (via Raast, JazzCash, Easypaisa, or Bank Card), our automated Yesim Partner engine issues your QR code, iPhone 1-tap install link, and LPA activation string right on screen and via email.',
  },
  {
    q: 'Can I use Personal Hotspot & Wi-Fi Tethering?',
    a: 'Yes, Personal Hotspot is enabled on Pak-Tel data plans so you can share mobile data with your laptop or secondary phone.',
  },
  {
    q: 'Can I reload / top up my existing eSIM instead of installing a new QR code?',
    a: 'Absolutely! Every reloadable plan lets you keep the same ICCID installed on your phone. Just visit "Check Balance / Top-Up", enter your 19-digit ICCID, and add a new data bundle in seconds.',
  },
  {
    q: 'How can I verify if my phone supports eSIM before buying?',
    a: 'Dial *#06# on your phone keypad — if you see a 32-digit EID barcode/number, your phone hardware supports eSIM! Make sure your device is also carrier-unlocked, or check our Supported Devices tool above.',
  },
];

export function StorefrontPage({ config }: { config: StoreConfig | null }) {
  const { user } = useAuth();
  const [bundles, setBundles] = useState<PublicBundle[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('recommended');
  const [reloadableOnly, setReloadableOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBundle, setSelectedBundle] = useState<PublicBundle | null>(null);

  // Device compatibility state
  const [devices, setDevices] = useState<DeviceCategory[]>([]);
  const [activeBrand, setActiveBrand] = useState('Apple');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    let mounted = true;
    setLoadingBundles(true);
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (sort) params.set('sort', sort);
    if (reloadableOnly) params.set('reloadable', 'true');
    if (searchQuery.trim()) params.set('q', searchQuery.trim());

    apiFetch<PublicBundle[]>(`/api/bundles?${params.toString()}`)
      .then((res) => {
        if (mounted) setBundles(res);
      })
      .catch(() => {
        if (mounted) setBundles([]);
      })
      .finally(() => {
        if (mounted) setLoadingBundles(false);
      });

    return () => {
      mounted = false;
    };
  }, [category, sort, reloadableOnly, searchQuery]);

  useEffect(() => {
    apiFetch<DeviceCategory[]>('/api/compatibility/devices')
      .then((res) => setDevices(res))
      .catch(() => setDevices([]));
  }, []);

  const flattenedBrands = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cat of devices) {
      for (const b of cat.brands || []) {
        const list = map.get(b.brand) || [];
        for (const m of b.models || []) {
          if (!list.includes(m.model)) list.push(m.model);
        }
        map.set(b.brand, list);
      }
    }
    return Array.from(map.entries()).map(([brand, models]) => ({ brand, models }));
  }, [devices]);

  const filteredDeviceModels = useMemo(() => {
    if (deviceQuery.trim()) {
      const q = deviceQuery.trim().toLowerCase();
      const hits: { brand: string; model: string }[] = [];
      for (const b of flattenedBrands) {
        for (const m of b.models) {
          if (b.brand.toLowerCase().includes(q) || m.toLowerCase().includes(q)) {
            hits.push({ brand: b.brand, model: m });
          }
        }
      }
      return hits;
    }
    const found = flattenedBrands.find((b) => b.brand === activeBrand) || flattenedBrands[0];
    return (found?.models || []).map((m) => ({ brand: found.brand, model: m }));
  }, [flattenedBrands, activeBrand, deviceQuery]);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-900 bg-gradient-to-b from-emerald-950/35 via-slate-950 to-slate-950 pt-12 pb-16 sm:pt-16 sm:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-5">
              <Sparkles className="w-3.5 h-3.5" />
              PTA-Blocked Phone Data Solution • Instant 2-Min QR Activation
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
              Pakistan&apos;s Cheapest{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                5G / 4G Data eSIM
              </span>{' '}
              Store
            </h1>

            <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              Stay connected anywhere in Pakistan without carrying a second phone or pocket Wi-Fi.
              Pay seamlessly in <strong className="text-white">PKR via DPay</strong> (Raast,
              JazzCash, Easypaisa &amp; Bank Cards) and scan your QR code immediately.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <a
                href="#plans"
                className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/25 transition"
              >
                Explore Data Bundles
              </a>
              <Link
                to="/my-esim"
                className="px-5 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold text-sm flex items-center gap-2 transition"
              >
                <QrCode className="w-4 h-4 text-emerald-400" />
                Check ICCID Balance / Top-Up
              </Link>
            </div>

            <div className="mt-9 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-800/80 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-slate-300">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Instant QR Delivery</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Hotspot Enabled</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Reloadable ICCID</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>DPay PKR Checkout</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bundles Catalog Section */}
      <section id="plans" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Choose Your Data Bundle
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Transparent whole-rupee PKR pricing • Zero hidden roaming charges
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search GB or days..."
                className="pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 focus:outline-none text-xs sm:text-sm text-white w-44 sm:w-52"
              />
            </div>

            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reloadableOnly}
                onChange={(e) => setReloadableOnly(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              Reloadable Only
            </label>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort bundles"
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="recommended">Sort: Recommended</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="data_desc">Data: Highest First</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition border ${
                category === cat.id
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Bundle Grid */}
        {loadingBundles ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-80 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse"
              />
            ))}
          </div>
        ) : bundles.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-10 text-center max-w-xl mx-auto">
            <Globe2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white">No Active Bundles Match Your Filter</h3>
            <p className="text-sm text-slate-400 mt-1.5">
              Bundles are curated and managed directly through the Pak-Tel Admin Panel.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              {category !== 'all' || searchQuery ? (
                <button
                  onClick={() => {
                    setCategory('all');
                    setSearchQuery('');
                    setReloadableOnly(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
                >
                  Reset Filters
                </button>
              ) : null}
              <Link
                to={user?.role === 'ADMIN' ? '/admin' : '/login'}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
              >
                {user?.role === 'ADMIN' ? 'Manage Bundles in Admin Panel' : 'Admin Sign In'}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bundles.map((b) => {
              const savings =
                b.priceDifferencePkr && b.priceDifferencePkr > 0
                  ? b.priceDifferencePkr
                  : b.actualPricePkr && b.actualPricePkr > b.pricePkr
                    ? b.actualPricePkr - b.pricePkr
                    : 0;

              return (
                <div
                  key={b.id}
                  className={`relative rounded-2xl p-6 flex flex-col justify-between transition border ${
                    b.isMostPopular
                      ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/30 border-emerald-500/50 shadow-xl shadow-emerald-500/10'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-xs font-semibold text-slate-200">
                          🇵🇰 {b.countryName}
                        </span>
                        {b.isMostPopular && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[11px] font-bold">
                            <Flame className="w-3 h-3 fill-amber-400 text-amber-400" />
                            Most Popular
                          </span>
                        )}
                      </div>

                      {b.discountPct && b.discountPct > 0 ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-extrabold">
                          {b.discountPct}% OFF
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-xl font-extrabold text-white">{b.name}</h3>

                    {/* Pricing Block */}
                    <div className="mt-3 flex items-baseline gap-2.5">
                      <span className="text-3xl font-black text-emerald-400">
                        {formatPkr(b.pricePkr)}
                      </span>
                      {b.actualPricePkr && b.actualPricePkr > b.pricePkr && (
                        <span className="text-sm text-slate-500 line-through font-medium">
                          {formatPkr(b.actualPricePkr)}
                        </span>
                      )}
                    </div>
                    {savings > 0 && (
                      <div className="text-xs font-medium text-emerald-300/90 mt-0.5">
                        You save {formatPkr(savings)}
                      </div>
                    )}

                    {/* Spec Rows matching pak-tel.com */}
                    <div className="mt-5 pt-4 border-t border-slate-800/90 space-y-2.5 text-xs sm:text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Data allowance</span>
                        <span className="font-bold text-white">{b.dataLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Validity period</span>
                        <span className="font-semibold text-slate-200">
                          {b.validityDays} {b.validityDays === 1 ? 'Day' : 'Days'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Coverage</span>
                        <span className="font-semibold text-slate-200">{b.coverageType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Plan type</span>
                        <span className="font-semibold text-slate-200">{b.planType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Hotspot / Tethering</span>
                        <span className="font-semibold text-emerald-400">
                          {b.hotspotAllowed ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Plan activation</span>
                        <span className="font-semibold text-slate-200">{b.activationType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Reloadable ICCID</span>
                        <span className="font-semibold text-emerald-400">
                          {b.isReloadable ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedBundle(b)}
                    className={`mt-6 w-full py-3 rounded-xl font-bold text-sm transition ${
                      b.isMostPopular
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-800 hover:bg-emerald-500 text-white hover:text-slate-950'
                    }`}
                  >
                    Buy Now — {formatPkr(b.pricePkr)}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* How It Works */}
      <section className="border-y border-slate-900 bg-slate-900/30 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Get Online in 3 Simple Steps
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              No physical SIM swap, no passport queues, and no extra hotspot device needed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Pick Your Data Plan',
                desc: 'Select from Trial 0.5 GB up to 30 GB or Unlimited Data plans tailored for Pakistan 4G/LTE/5G coverage.',
              },
              {
                step: '02',
                title: 'Pay Instantly in PKR via DPay',
                desc: 'Complete secure whole-rupee PKR payment using Raast, JazzCash, Easypaisa, or Debit/Credit Card.',
              },
              {
                step: '03',
                title: 'Scan QR or 1-Tap iPhone Install',
                desc: 'Scan your instant QR code (or tap Install on iPhone), turn on Data Roaming for the eSIM line, and enjoy fast internet!',
              },
            ].map((s) => (
              <div
                key={s.step}
                className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800"
              >
                <span className="text-xs font-black tracking-widest text-emerald-400 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  STEP {s.step}
                </span>
                <h3 className="text-lg font-bold text-white mt-4">{s.title}</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Device Compatibility Checker */}
      <section id="compatibility" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-3xl bg-slate-900/75 border border-slate-800 p-6 sm:p-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Hardware Verification
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                eSIM Device Compatibility Checker
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Quick tip: Dial <code className="text-emerald-300 font-mono">*#06#</code> — if
                an <strong>EID</strong> number appears, your smartphone supports eSIM!
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
                placeholder="Search iPhone 15, Galaxy S24, Pixel..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white"
              />
            </div>
          </div>

          {!deviceQuery.trim() && (
            <div className="flex flex-wrap gap-2 mb-6">
              {flattenedBrands.map((b) => (
                <button
                  key={b.brand}
                  onClick={() => setActiveBrand(b.brand)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold border transition ${
                    activeBrand === b.brand
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {b.brand}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
            {filteredDeviceModels.map((item, idx) => (
              <div
                key={`${item.brand}-${item.model}-${idx}`}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-emerald-400">{item.brand}</div>
                  <div className="text-sm text-slate-200">{item.model}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Everything you need to know about Pak-Tel Data eSIMs &amp; DPay payments
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4"
                >
                  <span className="font-semibold text-sm sm:text-base text-white">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180 text-emerald-400' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <CheckoutModal
        bundle={selectedBundle}
        onClose={() => setSelectedBundle(null)}
      />
    </div>
  );
}
