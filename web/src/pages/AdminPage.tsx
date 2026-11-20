import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, Bundle, formatBytes, formatPkr } from '../lib/api';

function NotFoundView() {
  return (
    <div className="pt-[120px] pb-24 bg-[#f5f6f1] min-h-[75vh] flex items-center">
      <div className="pt-container max-w-lg text-center">
        <span className="font-mono-pt text-xs uppercase tracking-widest text-[#071322]/50">
          404 • Not Found
        </span>
        <h1 className="font-display text-5xl font-semibold tracking-tight mt-2 text-[#071322]">
          Page not found.
        </h1>
        <p className="mt-3 text-sm text-[#071322]/65">
          The page you requested does not exist. Explore Pak-Tel data plans or check your eSIM
          balance below.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Link to="/" className="pt-btn pt-btn--lime">
            Browse Plans ↗
          </Link>
          <Link to="/my-esim" className="pt-btn pt-btn--dark">
            Check ICCID ↗
          </Link>
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  yesimPackageCode: '',
  name: '',
  countryCode: 'PK',
  countryName: 'Pakistan',
  region: 'South Asia',
  dataMb: 5120,
  dataDisplay: '5 GB',
  validityDays: 15,
  coverage: '5G/4G/LTE',
  planType: 'Data only',
  hotspotSupported: true,
  activationType: 'Instant',
  reloadable: true,
  unlimited: false,
  pricePkr: 1499,
  originalPricePkr: 2099,
  costUsdCents: 410,
  badge: 'Flexible data',
  sortOrder: 12,
  enabled: true,
};

export function AdminPage() {
  const location = useLocation();
  const secretSlug = location.pathname.replace(/^\/+|\/+$/g, '');

  const [gateState, setGateState] = useState<'checking' | 'denied' | 'allowed'>('checking');
  const [credentialsConfigured, setCredentialsConfigured] = useState(true);
  const [adminToken, setAdminToken] = useState<string>(
    () => sessionStorage.getItem('paktel_admin_jwt') || '',
  );

  // Login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Console state
  const [tab, setTab] = useState<'overview' | 'bundles' | 'orders' | 'esims' | 'settings'>(
    'overview',
  );
  const [dashboard, setDashboard] = useState<any>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [esims, setEsims] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [settings, setSettings] = useState<{
    fxRateUsdToPkr: number;
    defaultMarginPercent: number;
    storeNotice: string;
  }>({ fxRateUsdToPkr: 278.5, defaultMarginPercent: 30, storeNotice: '' });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!secretSlug) {
      setGateState('denied');
      return;
    }
    setGateState('checking');
    api
      .verifyAdminGate(secretSlug)
      .then((res) => {
        if (!active) return;
        if (res?.authorizedRoute) {
          setCredentialsConfigured(res.credentialsConfigured);
          setGateState('allowed');
        } else {
          setGateState('denied');
        }
      })
      .catch(() => {
        if (active) setGateState('denied');
      });
    return () => {
      active = false;
    };
  }, [secretSlug]);

  useEffect(() => {
    if (gateState === 'allowed' && adminToken) {
      refreshAll();
    }
  }, [gateState, adminToken]);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function refreshAll() {
    try {
      const [d, b, o, e, s, w] = await Promise.all([
        api.adminFetch(secretSlug, adminToken, '/dashboard'),
        api.adminFetch<Bundle[]>(secretSlug, adminToken, '/bundles'),
        api.adminFetch<any[]>(secretSlug, adminToken, '/orders'),
        api.adminFetch<any[]>(secretSlug, adminToken, '/esims'),
        api.adminFetch<any>(secretSlug, adminToken, '/settings'),
        api.adminFetch<any[]>(secretSlug, adminToken, '/webhooks'),
      ]);
      setDashboard(d);
      setBundles(b);
      setOrders(o);
      setEsims(e);
      setSettings(s);
      setWebhooks(w);
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('unauthorized')) {
        sessionStorage.removeItem('paktel_admin_jwt');
        setAdminToken('');
      }
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await api.adminLogin(secretSlug, email.trim(), password);
      sessionStorage.setItem('paktel_admin_jwt', res.accessToken);
      setAdminToken(res.accessToken);
      setPassword('');
    } catch (err: any) {
      setLoginError(err?.message || 'Admin login failed');
    } finally {
      setLoggingIn(false);
    }
  }

  async function saveBundle(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.adminFetch(secretSlug, adminToken, `/bundles/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        notify('Plan updated.');
      } else {
        await api.adminFetch(secretSlug, adminToken, '/bundles', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        notify('New plan created.');
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
      await refreshAll();
    } catch (err: any) {
      notify(err?.message || 'Failed to save plan');
    }
  }

  async function toggleBundle(b: Bundle) {
    await api.adminFetch(secretSlug, adminToken, `/bundles/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !b.enabled }),
    });
    await refreshAll();
  }

  async function deleteBundle(id: string) {
    if (!window.confirm('Delete this plan permanently?')) return;
    await api.adminFetch(secretSlug, adminToken, `/bundles/${id}`, { method: 'DELETE' });
    notify('Plan deleted.');
    await refreshAll();
  }

  async function resendMailjetEmail(orderId: string) {
    try {
      const res = await api.adminFetch(
        secretSlug,
        adminToken,
        `/orders/${orderId}/resend-email`,
        { method: 'POST' },
      );
      notify(
        res.sent
          ? 'eSIM email sent via Mailjet!'
          : `Mailjet status: ${res.status} (${res.error || ''})`,
      );
      await refreshAll();
    } catch (err: any) {
      notify(err?.message || 'Mailjet resend failed');
    }
  }

  async function retryProvision(orderId: string) {
    try {
      await api.adminFetch(secretSlug, adminToken, `/orders/${orderId}/retry-provision`, {
        method: 'POST',
      });
      notify('Order provisioned & Mailjet delivery triggered.');
      await refreshAll();
    } catch (err: any) {
      notify(err?.message || 'Provision retry failed');
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    await api.adminFetch(secretSlug, adminToken, '/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    notify('Store settings updated.');
    await refreshAll();
  }

  if (gateState === 'checking') {
    return (
      <div className="pt-[120px] pb-24 bg-[#f5f6f1] min-h-[75vh] flex items-center justify-center">
        <span className="font-mono-pt text-xs uppercase text-[#071322]/50">Loading…</span>
      </div>
    );
  }

  if (gateState === 'denied') {
    return <NotFoundView />;
  }

  // Secret route verified — show Admin Login if not authenticated yet
  if (!adminToken) {
    return (
      <div className="pt-[115px] pb-24 bg-[#f5f6f1] min-h-[80vh] flex items-center">
        <div className="pt-container max-w-md">
          <div className="rounded-[24px] bg-white border border-[#071322]/15 shadow-2xl overflow-hidden">
            <div className="bg-[#071322] text-white p-7 border-b-4 border-[#c8ff43]">
              <img src="/ptlogo.png" alt="Pak-Tel" className="h-12 w-auto mb-3" />
              <span className="font-mono-pt text-[10px] uppercase tracking-widest text-[#c8ff43]">
                Private Admin Route Verified
              </span>
              <h1 className="font-display text-2xl font-semibold mt-1">Pak-Tel Operations</h1>
            </div>

            <form onSubmit={handleLogin} className="p-7 space-y-4">
              {!credentialsConfigured && (
                <div className="rounded-xl bg-[#ffad71]/30 border border-[#ffad71] p-3.5 text-xs text-[#071322]">
                  <strong>Runtime Secrets Required:</strong> Add <code>ADMIN_EMAIL</code> and{' '}
                  <code>ADMIN_PASSWORD</code> in Cloudflare Workers → Settings → Variables and
                  Secrets.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold mb-1.5">Admin Email / ID</label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#071322]/20 px-4 py-3 text-sm outline-none focus:border-[#071322]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5">Admin Password</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#071322]/20 px-4 py-3 text-sm outline-none focus:border-[#071322]"
                />
              </div>

              {loginError && (
                <div className="rounded-xl bg-[#ff7a6b]/20 border border-[#ff7a6b] p-3 text-xs font-semibold text-[#7b1e14]">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="pt-btn pt-btn--lime w-full"
              >
                {loggingIn ? 'Verifying…' : 'Unlock Admin Console ↗'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="pt-[104px] pb-20 bg-[#f5f6f1] min-h-screen">
      <div className="pt-container space-y-6">
        {/* Top Admin Header */}
        <div className="rounded-[22px] bg-[#071322] text-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="font-mono-pt text-[10px] uppercase tracking-widest text-[#c8ff43]">
              Secret Admin Console • Runtime Secrets Mode
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1">
              Pak-Tel Inventory, Orders &amp; Mailjet Delivery
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['overview', 'Overview'],
                ['bundles', `Plans (${bundles.length})`],
                ['orders', `Orders (${orders.length})`],
                ['esims', `eSIMs (${esims.length})`],
                ['settings', 'Settings & Webhooks'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  tab === id
                    ? 'bg-[#c8ff43] text-[#071322]'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('paktel_admin_jwt');
                setAdminToken('');
              }}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-[#ff7a6b]/20 text-[#ff7a6b] hover:bg-[#ff7a6b] hover:text-[#071322]"
            >
              Sign out
            </button>
          </div>
        </div>

        {toast && (
          <div className="rounded-xl bg-[#071322] text-[#c8ff43] px-5 py-3 text-xs font-mono-pt font-bold shadow-lg">
            ✓ {toast}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                ['Revenue (PKR)', formatPkr(dashboard?.revenuePkr || 0)],
                ['Paid Orders', String(dashboard?.paidOrdersCount || 0)],
                ['Provisioned eSIMs', String(dashboard?.activeEsimsCount || 0)],
                ['Active Plans', String(dashboard?.activeBundlesCount || 0)],
                ['Mailjet Sent', String(dashboard?.emailsDeliveredCount || 0)],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white border border-[#071322]/12 p-5"
                >
                  <span className="font-mono-pt text-[10px] uppercase text-[#071322]/55">
                    {label}
                  </span>
                  <strong className="font-display text-2xl sm:text-3xl font-bold block mt-2">
                    {val}
                  </strong>
                </div>
              ))}
            </div>

            {/* Runtime Variables & Secrets Readiness */}
            <div className="rounded-2xl bg-white border border-[#071322]/12 p-6 space-y-4">
              <h2 className="font-display text-xl font-semibold">
                Cloudflare Runtime Variables &amp; Secrets Status
              </h2>
              <p className="text-xs text-[#071322]/65">
                Secret values are never exposed to the browser or stored in source code. Status
                below reflects whether each integration key is present at runtime:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {[
                  ['Yesim Partner API (YESIM_API_TOKEN)', dashboard?.runtimeIntegrations?.yesimConfigured],
                  ['DPay Checkout API (DPAY_API_KEY + SECRET)', dashboard?.runtimeIntegrations?.dpayConfigured],
                  ['DPay Webhook HMAC (DPAY_WEBHOOK_SECRET)', dashboard?.runtimeIntegrations?.dpayWebhookSecretConfigured],
                  ['Mailjet Send v3.1 (MAILJET_API_KEY + SECRET + FROM)', dashboard?.runtimeIntegrations?.mailjetConfigured],
                  ['Mailjet Event Webhook Auth (MAILJET_WEBHOOK_SECRET)', dashboard?.runtimeIntegrations?.mailjetWebhookSecretConfigured],
                  ['Admin JWT Signing Key (JWT_SECRET)', dashboard?.runtimeIntegrations?.jwtSecretConfigured],
                ].map(([name, ok]) => (
                  <div
                    key={String(name)}
                    className="rounded-xl bg-[#f5f6f1] border border-[#071322]/10 p-3.5 flex items-center justify-between gap-2"
                  >
                    <span className="font-semibold">{name}</span>
                    <span
                      className={`font-mono-pt text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        ok
                          ? 'bg-[#c8ff43] text-[#071322]'
                          : 'bg-[#ffad71]/40 text-[#071322]'
                      }`}
                    >
                      {ok ? 'CONFIGURED' : 'NOT SET'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-[#071322] text-white p-4 space-y-1.5 text-xs font-mono-pt">
                <p className="text-[#c8ff43] uppercase text-[10px]">Webhook Callback URLs</p>
                <p>DPay Webhook (payment.succeeded): {originUrl}/api/webhooks/dpay</p>
                <p>Mailjet Event Webhook (sent/open/bounce): {originUrl}/api/webhooks/mailjet</p>
                <p>Yesim Usage Webhook: {originUrl}/api/webhooks/yesim</p>
              </div>
            </div>
          </div>
        )}

        {/* BUNDLES / PLANS CRUD TAB */}
        {tab === 'bundles' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={saveBundle}
              className="lg:col-span-5 rounded-2xl bg-white border border-[#071322]/12 p-6 space-y-3.5 self-start"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold">
                  {editingId ? 'Edit Plan' : 'Create Manual Plan'}
                </h2>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                    }}
                    className="text-xs underline font-bold"
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="col-span-2">
                  <label className="block font-bold mb-1">Plan Title</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. 15 GB 30 Days"
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Yesim Package Code</label>
                  <input
                    required
                    value={form.yesimPackageCode}
                    onChange={(e) => setForm({ ...form, yesimPackageCode: e.target.value })}
                    placeholder="PK_15GB_30D"
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Badge</label>
                  <input
                    value={form.badge || ''}
                    onChange={(e) => setForm({ ...form, badge: e.target.value })}
                    placeholder="Most popular / Flexible data"
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Country ISO</label>
                  <input
                    required
                    value={form.countryCode}
                    onChange={(e) =>
                      setForm({ ...form, countryCode: e.target.value.toUpperCase() })
                    }
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Country Name</label>
                  <input
                    required
                    value={form.countryName}
                    onChange={(e) => setForm({ ...form, countryName: e.target.value })}
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Data Display</label>
                  <input
                    required
                    value={form.dataDisplay}
                    onChange={(e) => setForm({ ...form, dataDisplay: e.target.value })}
                    placeholder="15 GB / Unlimited Data"
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Data (MB)</label>
                  <input
                    type="number"
                    required
                    value={form.dataMb}
                    onChange={(e) => setForm({ ...form, dataMb: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    required
                    value={form.validityDays}
                    onChange={(e) => setForm({ ...form, validityDays: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Selling Price (PKR)</label>
                  <input
                    type="number"
                    required
                    value={form.pricePkr}
                    onChange={(e) => setForm({ ...form, pricePkr: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Actual/Strike Price (PKR)</label>
                  <input
                    type="number"
                    value={form.originalPricePkr || 0}
                    onChange={(e) =>
                      setForm({ ...form, originalPricePkr: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1 text-xs font-semibold">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(form.reloadable)}
                    onChange={(e) => setForm({ ...form, reloadable: e.target.checked })}
                  />
                  Reloadable
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(form.unlimited)}
                    onChange={(e) => setForm({ ...form, unlimited: e.target.checked })}
                  />
                  Unlimited
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(form.hotspotSupported)}
                    onChange={(e) => setForm({ ...form, hotspotSupported: e.target.checked })}
                  />
                  Hotspot
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(form.enabled)}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              <button type="submit" className="pt-btn pt-btn--lime w-full">
                {editingId ? 'Save Plan Changes' : 'Add Plan to Live Inventory'}
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {bundles.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl bg-white border border-[#071322]/12 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-pt text-xs font-bold px-2 py-0.5 rounded bg-[#071322] text-[#c8ff43]">
                        #{b.sortOrder}
                      </span>
                      <strong className="font-display text-base">{b.name}</strong>
                      <span className="font-mono-pt text-xs text-[#071322]/55">
                        ({b.yesimPackageCode})
                      </span>
                      {!b.enabled && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ff7a6b]/30">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#071322]/65 mt-1 font-mono-pt">
                      {b.countryName} • {b.dataDisplay} • {b.validityDays}d •{' '}
                      {b.originalPricePkr ? (
                        <span className="line-through mr-1">{formatPkr(b.originalPricePkr)}</span>
                      ) : null}
                      <strong className="text-[#071322]">{formatPkr(b.pricePkr)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(b.id);
                        setForm({ ...b, originalPricePkr: b.originalPricePkr || 0 });
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#071322]/20 font-bold hover:bg-[#071322] hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBundle(b)}
                      className="px-3 py-1.5 rounded-lg border border-[#071322]/20 font-bold"
                    >
                      {b.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBundle(b.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#ff7a6b]/20 text-[#7b1e14] font-bold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ORDERS & MAILJET DELIVERY TAB */}
        {tab === 'orders' && (
          <div className="rounded-2xl bg-white border border-[#071322]/12 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#071322] text-white font-mono-pt text-[10px] uppercase">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer Email</th>
                  <th className="px-4 py-3">Plan / Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Order Status</th>
                  <th className="px-4 py-3">Mailjet Delivery</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#071322]/10">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono-pt font-bold">
                      #{o.id.slice(0, 8).toUpperCase()}
                      {o.iccid && (
                        <span className="block text-[10px] text-[#071322]/55">{o.iccid}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{o.customerEmail}</td>
                    <td className="px-4 py-3">
                      <strong>{o.bundleName}</strong>{' '}
                      <span className="font-mono-pt text-[10px]">({o.kind})</span>
                    </td>
                    <td className="px-4 py-3 font-mono-pt font-bold">{formatPkr(o.amountPkr)}</td>
                    <td className="px-4 py-3 font-mono-pt font-bold">{o.status}</td>
                    <td className="px-4 py-3 font-mono-pt">
                      <span className="px-2 py-0.5 rounded bg-[#e9ebe4] font-bold">
                        {o.emailDeliveryStatus}
                      </span>
                      {o.emailError && (
                        <span className="block text-[10px] text-[#7b1e14] mt-0.5">
                          {o.emailError}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-1.5 whitespace-nowrap">
                      {o.status === 'PROVISIONED' && (
                        <button
                          type="button"
                          onClick={() => resendMailjetEmail(o.id)}
                          className="px-2.5 py-1 rounded bg-[#071322] text-[#c8ff43] font-bold"
                        >
                          Resend Mailjet
                        </button>
                      )}
                      {o.status !== 'PROVISIONED' && (
                        <button
                          type="button"
                          onClick={() => retryProvision(o.id)}
                          className="px-2.5 py-1 rounded bg-[#c8ff43] text-[#071322] font-bold"
                        >
                          Force Provision
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ESIMS TAB */}
        {tab === 'esims' && (
          <div className="rounded-2xl bg-white border border-[#071322]/12 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#071322] text-white font-mono-pt text-[10px] uppercase">
                <tr>
                  <th className="px-4 py-3">ICCID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Remaining / Total</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#071322]/10">
                {esims.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-mono-pt font-bold">{e.iccid}</td>
                    <td className="px-4 py-3 font-mono-pt">{e.status}</td>
                    <td className="px-4 py-3 font-mono-pt">
                      {formatBytes(e.remainingBytes)} / {formatBytes(e.totalBytes)}
                    </td>
                    <td className="px-4 py-3 font-mono-pt">
                      {e.expiresAt ? new Date(e.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.adminFetch(secretSlug, adminToken, `/esims/${e.id}/sync`, {
                            method: 'POST',
                          });
                          notify('Synced with Yesim.');
                          refreshAll();
                        }}
                        className="px-2.5 py-1 rounded border border-[#071322]/25 font-bold"
                      >
                        Sync Yesim
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SETTINGS & WEBHOOKS TAB */}
        {tab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={saveSettings}
              className="lg:col-span-5 rounded-2xl bg-white border border-[#071322]/12 p-6 space-y-4 self-start"
            >
              <h2 className="font-display text-xl font-semibold">Store Ticker &amp; FX Settings</h2>
              <div>
                <label className="block text-xs font-bold mb-1">Header Updates Ticker Text</label>
                <textarea
                  rows={3}
                  value={settings.storeNotice || ''}
                  onChange={(e) => setSettings({ ...settings, storeNotice: e.target.value })}
                  className="w-full rounded-xl border border-[#071322]/20 p-3 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold mb-1">USD → PKR Rate</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.fxRateUsdToPkr}
                    onChange={(e) =>
                      setSettings({ ...settings, fxRateUsdToPkr: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Default Margin (%)</label>
                  <input
                    type="number"
                    value={settings.defaultMarginPercent}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultMarginPercent: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-[#071322]/20 px-3 py-2 font-mono-pt"
                  />
                </div>
              </div>
              <button type="submit" className="pt-btn pt-btn--lime w-full">
                Save Store Settings
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl bg-white border border-[#071322]/12 p-6">
              <h2 className="font-display text-xl font-semibold mb-4">
                Recent Webhook Events (DPay • Mailjet • Yesim)
              </h2>
              {webhooks.length === 0 ? (
                <p className="text-xs text-[#071322]/55">No webhook deliveries recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {webhooks.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-xl bg-[#f5f6f1] px-4 py-2.5 flex items-center justify-between text-xs font-mono-pt"
                    >
                      <span>
                        <strong>[{w.provider}]</strong> {w.eventType}
                      </span>
                      <span className="text-[#071322]/55">
                        {new Date(w.processedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
