import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Edit3,
  Layers,
  Loader2,
  PackagePlus,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AdminBundle,
  apiFetch,
  EsimRecord,
  formatMbToReadable,
  formatPkr,
} from '../lib/api';
import { useAuth } from '../lib/auth';

interface YesimPlanOption {
  id: string;
  name: string;
  days: string;
  data: string;
  countries_included: string;
  countryIso2: string;
  operators: string;
  price: string;
  currency: string;
}

interface DashboardData {
  metrics: {
    totalRevenuePkr: number;
    estimatedCommissionPkr: number;
    totalBundles: number;
    activeBundles: number;
    totalOrders: number;
    provisionedOrders: number;
    pendingOrders: number;
    failedOrders: number;
    totalEsims: number;
    activeEsims: number;
    completedTopUps: number;
  };
  yesim: { balance: number; currency: string; mock?: boolean };
  dpay: { healthy: boolean; mockMode: boolean };
}

interface AdminOrder {
  id: string;
  orderNumber: string;
  customerEmail: string;
  customerPhone: string | null;
  amountPkr: number;
  status: string;
  dpaySessionId: string | null;
  lastError: string | null;
  createdAt: string;
  items: { bundleName: string; quantity: number }[];
}

interface BundleFormState {
  id?: string;
  name: string;
  pricePkr: number;
  actualPricePkr: string;
  discountPct: string;
  priceDifferencePkr: string;
  dataLabel: string;
  dataGb: string;
  isUnlimited: boolean;
  validityDays: number;
  isReloadable: boolean;
  isMostPopular: boolean;
  costEur: string;
  costPkr: string;
  commissionPkr: string;
  eurToPkr: number;
  yesimPlanId: string;
  contact: string;
  message: string;
  countryCode: string;
  countryName: string;
  coverageType: string;
  planType: string;
  hotspotAllowed: boolean;
  activationType: string;
  operators: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyBundleForm = (fx = 303.8602): BundleFormState => ({
  name: '',
  pricePkr: 1999,
  actualPricePkr: '3499',
  discountPct: '',
  priceDifferencePkr: '',
  dataLabel: '10 GB',
  dataGb: '10',
  isUnlimited: false,
  validityDays: 30,
  isReloadable: true,
  isMostPopular: false,
  costEur: '',
  costPkr: '',
  commissionPkr: '',
  eurToPkr: fx,
  yesimPlanId: '',
  contact: '3259717066',
  message: '',
  countryCode: 'PK',
  countryName: 'Pakistan',
  coverageType: '5G/4G/LTE',
  planType: 'Data only',
  hotspotAllowed: true,
  activationType: 'Instant',
  operators: 'Jazz (Mobilink) Pakistan',
  sortOrder: 10,
  isActive: true,
});

export function AdminPage({ onSettingsChanged }: { onSettingsChanged: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<'overview' | 'bundles' | 'orders' | 'esims' | 'settings'>(
    'bundles',
  );
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [bundles, setBundles] = useState<AdminBundle[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [esims, setEsims] = useState<EsimRecord[]>([]);
  const [esimSearch, setEsimSearch] = useState('');
  const [webhooks, setWebhooks] = useState<
    { id: string; source: string; eventType: string; receivedAt: string; error: string | null }[]
  >([]);

  // Bundle modal & Yesim plan browser
  const [editingBundle, setEditingBundle] = useState<BundleFormState | null>(null);
  const [yesimPlans, setYesimPlans] = useState<YesimPlanOption[]>([]);
  const [showYesimPicker, setShowYesimPicker] = useState(false);
  const [yesimFilterText, setYesimFilterText] = useState('Pakistan');
  const [fxInput, setFxInput] = useState('303.8602');
  const [busy, setBusy] = useState(false);

  // Bulk voucher modal
  const [bulkPlanId, setBulkPlanId] = useState('');
  const [bulkCount, setBulkCount] = useState(2);
  const [bulkVoucher, setBulkVoucher] = useState(true);

  // Settings form
  const [settingsForm, setSettingsForm] = useState<{
    storeName: string;
    tagline: string;
    announcementTicker: string;
    whatsappNumber: string;
    supportEmail: string;
    defaultEurToPkr: number;
    yesimBaseUrl: string;
    yesimApiToken: string;
    yesimMockMode: boolean;
    dpayBaseUrl: string;
    dpayApiKey: string;
    dpayWebhookSecret: string;
    dpayMockMode: boolean;
  } | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadAll = async () => {
    try {
      const [dash, bList, oList, eList, sData, wList] = await Promise.all([
        apiFetch<DashboardData>('/api/admin/dashboard'),
        apiFetch<AdminBundle[]>('/api/admin/bundles'),
        apiFetch<AdminOrder[]>('/api/admin/orders'),
        apiFetch<EsimRecord[]>('/api/admin/esims'),
        apiFetch<NonNullable<typeof settingsForm>>('/api/admin/settings'),
        apiFetch<typeof webhooks>('/api/admin/webhooks'),
      ]);
      setDashboard(dash);
      setBundles(bList);
      setOrders(oList);
      setEsims(eList);
      if (sData) {
        setSettingsForm({
          storeName: sData.storeName || 'Pak-Tel',
          tagline: sData.tagline || '',
          announcementTicker: sData.announcementTicker || '',
          whatsappNumber: sData.whatsappNumber || '923259717066',
          supportEmail: sData.supportEmail || 'support@pak-tel.com',
          defaultEurToPkr: sData.defaultEurToPkr || 303.8602,
          yesimBaseUrl: sData.yesimBaseUrl || 'https://partners-api.yesim.biz',
          yesimApiToken: sData.yesimApiToken || '',
          yesimMockMode: Boolean(sData.yesimMockMode),
          dpayBaseUrl: sData.dpayBaseUrl || 'https://api.dpay.com.pk/v1',
          dpayApiKey: sData.dpayApiKey || '',
          dpayWebhookSecret: sData.dpayWebhookSecret || '',
          dpayMockMode: Boolean(sData.dpayMockMode),
        });
        setFxInput(String(sData.defaultEurToPkr || 303.8602));
      }
      setWebhooks(wList);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadAll();
    }
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/account" replace />;

  const openYesimBrowser = async () => {
    setShowYesimPicker(true);
    if (yesimPlans.length === 0) {
      try {
        const plans = await apiFetch<YesimPlanOption[]>('/api/admin/yesim/plans');
        setYesimPlans(plans);
      } catch (err) {
        setError((err as Error).message);
      }
    }
  };

  const applyYesimPlanToForm = (p: YesimPlanOption) => {
    if (!editingBundle) return;
    const isUnlim = /unlim/i.test(p.data);
    const dataLabel = isUnlim ? 'Unlimited Data' : `${p.data} GB`;
    const costEurNum = Number(p.price) || 0;
    const fx = editingBundle.eurToPkr || Number(fxInput) || 303.8602;
    const computedCostPkr = Math.round(costEurNum * fx * 10) / 10;

    setEditingBundle({
      ...editingBundle,
      yesimPlanId: p.id,
      name:
        editingBundle.name ||
        (isUnlim
          ? `Unlimited Data for ${p.days} Days`
          : `${p.data} GB ${p.days} Days`),
      dataLabel,
      dataGb: isUnlim ? '' : p.data,
      isUnlimited: isUnlim,
      validityDays: Number(p.days) || 30,
      costEur: p.price,
      costPkr: String(computedCostPkr),
      commissionPkr: String(Math.round(editingBundle.pricePkr - computedCostPkr)),
      countryCode: p.countryIso2 || 'PK',
      countryName: p.countries_included.split(',')[0] || 'Pakistan',
      operators: p.operators || 'Jazz (Mobilink) Pakistan',
    });
    setShowYesimPicker(false);
  };

  const openEditModal = (b: AdminBundle) => {
    setEditingBundle({
      id: b.id,
      name: b.name,
      pricePkr: b.pricePkr,
      actualPricePkr: b.actualPricePkr != null ? String(b.actualPricePkr) : '',
      discountPct: b.discountPct != null ? String(b.discountPct) : '',
      priceDifferencePkr:
        b.priceDifferencePkr != null ? String(b.priceDifferencePkr) : '',
      dataLabel: b.dataLabel,
      dataGb: b.dataGb != null ? String(b.dataGb) : '',
      isUnlimited: b.isUnlimited,
      validityDays: b.validityDays,
      isReloadable: b.isReloadable,
      isMostPopular: b.isMostPopular,
      costEur: b.costEur != null ? String(b.costEur) : '',
      costPkr: b.costPkr != null ? String(b.costPkr) : '',
      commissionPkr: b.commissionPkr != null ? String(b.commissionPkr) : '',
      eurToPkr: b.eurToPkr || Number(fxInput) || 303.8602,
      yesimPlanId: b.yesimPlanId,
      contact: b.contact || '3259717066',
      message: b.message || '',
      countryCode: b.countryCode || 'PK',
      countryName: b.countryName || 'Pakistan',
      coverageType: b.coverageType || '5G/4G/LTE',
      planType: b.planType || 'Data only',
      hotspotAllowed: b.hotspotAllowed,
      activationType: b.activationType || 'Instant',
      operators: b.operators || '',
      sortOrder: b.sortOrder,
      isActive: b.isActive,
    });
  };

  const handleSaveBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBundle) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: editingBundle.name,
        pricePkr: Number(editingBundle.pricePkr),
        actualPricePkr: editingBundle.actualPricePkr
          ? Number(editingBundle.actualPricePkr)
          : null,
        discountPct: editingBundle.discountPct
          ? Number(editingBundle.discountPct)
          : undefined,
        priceDifferencePkr: editingBundle.priceDifferencePkr
          ? Number(editingBundle.priceDifferencePkr)
          : undefined,
        dataLabel: editingBundle.dataLabel,
        dataGb:
          editingBundle.isUnlimited || !editingBundle.dataGb
            ? null
            : Number(editingBundle.dataGb),
        isUnlimited: editingBundle.isUnlimited,
        validityDays: Number(editingBundle.validityDays),
        isReloadable: editingBundle.isReloadable,
        isMostPopular: editingBundle.isMostPopular,
        costEur: editingBundle.costEur ? Number(editingBundle.costEur) : null,
        costPkr: editingBundle.costPkr ? Number(editingBundle.costPkr) : undefined,
        commissionPkr: editingBundle.commissionPkr
          ? Number(editingBundle.commissionPkr)
          : undefined,
        eurToPkr: Number(editingBundle.eurToPkr),
        yesimPlanId: editingBundle.yesimPlanId,
        contact: editingBundle.contact || null,
        message: editingBundle.message || null,
        countryCode: editingBundle.countryCode,
        countryName: editingBundle.countryName,
        coverageType: editingBundle.coverageType,
        planType: editingBundle.planType,
        hotspotAllowed: editingBundle.hotspotAllowed,
        activationType: editingBundle.activationType,
        operators: editingBundle.operators || null,
        sortOrder: Number(editingBundle.sortOrder),
        isActive: editingBundle.isActive,
      };

      if (editingBundle.id) {
        await apiFetch(`/api/admin/bundles/${editingBundle.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('Bundle updated!');
      } else {
        await apiFetch('/api/admin/bundles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('New bundle created!');
      }

      setEditingBundle(null);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBundle = async (b: AdminBundle) => {
    await apiFetch(`/api/admin/bundles/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    await loadAll();
  };

  const handleDeleteBundle = async (b: AdminBundle) => {
    if (!window.confirm(`Delete bundle "${b.name}"?`)) return;
    await apiFetch(`/api/admin/bundles/${b.id}`, { method: 'DELETE' });
    notify(`Deleted "${b.name}"`);
    await loadAll();
  };

  const handleImportSheet = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ created: number; skipped: number }>(
        '/api/admin/bundles/import-reference-sheet',
        { method: 'POST' },
      );
      notify(`Loaded ${res.created} Pak-Tel reference plans (${res.skipped} already present)`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecalculateFx = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ updatedBundles: number }>(
        '/api/admin/bundles/recalculate-fx',
        {
          method: 'POST',
          body: JSON.stringify({ eurToPkr: Number(fxInput) }),
        },
      );
      notify(`Recalculated PKR cost & commission across ${res.updatedBundles} bundles!`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setBusy(true);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsForm),
      });
      notify('Store & integration settings saved!');
      onSettingsChanged();
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleIssueBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkPlanId.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ issuedCount: number }>('/api/admin/yesim/issue-bulk', {
        method: 'POST',
        body: JSON.stringify({
          planId: bulkPlanId.trim(),
          count: Number(bulkCount),
          voucher: bulkVoucher,
        }),
      });
      notify(`Issued ${res.issuedCount} Yesim eSIMs!`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Pak-Tel Admin Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Manual Bundle Management • Yesim Partner Provisioning • DPay PKR Gateway
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'bundles', label: 'Bundles Catalog', icon: Layers },
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'orders', label: 'Orders & DPay', icon: ShoppingBag },
            { id: 'esims', label: 'eSIMs & Vouchers', icon: QrCode },
            { id: 'settings', label: 'Settings & Webhooks', icon: Settings },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 border transition ${
                  tab === t.id
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toast}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: MANUAL BUNDLES MANAGER */}
      {tab === 'bundles' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setEditingBundle(emptyBundleForm(Number(fxInput) || 303.8602))}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Manual Bundle
              </button>

              <button
                onClick={handleImportSheet}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Load 11 Pak-Tel Reference Plans
              </button>
            </div>

            {/* FX Rate Recalculator */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">EUR → PKR:</span>
              <input
                type="number"
                step="0.01"
                value={fxInput}
                onChange={(e) => setFxInput(e.target.value)}
                className="w-28 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white"
              />
              <button
                onClick={handleRecalculateFx}
                disabled={busy}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Recalculate Costs
              </button>
            </div>
          </div>

          {/* Bundles Spreadsheet Table */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-3 py-3">Plan Name</th>
                    <th className="px-3 py-3">Price (PKR)</th>
                    <th className="px-3 py-3">Actual</th>
                    <th className="px-3 py-3">Disc %</th>
                    <th className="px-3 py-3">Diff</th>
                    <th className="px-3 py-3">GBs / Days</th>
                    <th className="px-3 py-3">Cost (PKR)</th>
                    <th className="px-3 py-3">Commission</th>
                    <th className="px-3 py-3">Flags</th>
                    <th className="px-3 py-3">Yesim Plan ID</th>
                    <th className="px-3 py-3">Active</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {bundles.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-slate-400 text-sm">
                        No bundles created yet. Click <strong>Add Manual Bundle</strong> or{' '}
                        <strong>Load 11 Pak-Tel Reference Plans</strong> above.
                      </td>
                    </tr>
                  ) : (
                    bundles.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-800/30">
                        <td className="px-3 py-3 font-bold text-white">{b.name}</td>
                        <td className="px-3 py-3 font-extrabold text-emerald-400">
                          {formatPkr(b.pricePkr)}
                        </td>
                        <td className="px-3 py-3 text-slate-400 line-through">
                          {b.actualPricePkr ? formatPkr(b.actualPricePkr) : '—'}
                        </td>
                        <td className="px-3 py-3 text-emerald-300 font-semibold">
                          {b.discountPct ? `${b.discountPct}%` : '—'}
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {b.priceDifferencePkr ? formatPkr(b.priceDifferencePkr) : '—'}
                        </td>
                        <td className="px-3 py-3 text-slate-200">
                          {b.dataLabel} • {b.validityDays}d
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {b.costPkr != null ? `Rs. ${b.costPkr.toFixed(1)}` : '—'}
                          {b.costEur != null ? (
                            <span className="text-slate-500 ml-1">(€{b.costEur})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-bold text-teal-300">
                          {b.commissionPkr != null ? `Rs. ${Math.round(b.commissionPkr)}` : '—'}
                        </td>
                        <td className="px-3 py-3 space-x-1">
                          {b.isMostPopular && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                              Popular
                            </span>
                          )}
                          {b.isReloadable && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                              Reload
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-slate-400 max-w-[130px] truncate">
                          {b.yesimPlanId}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={b.isActive}
                            onChange={() => handleToggleBundle(b)}
                            className="accent-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-3 text-right space-x-1.5">
                          <button
                            onClick={() => openEditModal(b)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                            title="Edit Bundle"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBundle(b)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                            title="Delete Bundle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OVERVIEW DASHBOARD */}
      {tab === 'overview' && dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-xs text-slate-400">Gross Revenue (PKR)</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {formatPkr(dashboard.metrics.totalRevenuePkr)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {dashboard.metrics.provisionedOrders} paid orders +{' '}
              {dashboard.metrics.completedTopUps} top-ups
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-xs text-slate-400">Est. Net Commission</div>
            <div className="text-2xl font-black text-teal-300 mt-1">
              {formatPkr(dashboard.metrics.estimatedCommissionPkr)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Based on bundle Cost vs Price</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-xs text-slate-400">Yesim Partner Balance</div>
            <div className="text-2xl font-black text-white mt-1">
              €{dashboard.yesim.balance.toFixed(2)} {dashboard.yesim.currency}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Mode: {dashboard.yesim.mock ? 'Sandbox Simulation' : 'Live Partner API'}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-xs text-slate-400">Active Catalog &amp; eSIMs</div>
            <div className="text-2xl font-black text-white mt-1">
              {dashboard.metrics.activeBundles} Plans / {dashboard.metrics.activeEsims} eSIMs
            </div>
            <div className="text-xs text-slate-500 mt-1">
              DPay: {dashboard.dpay.mockMode ? 'Sandbox Mode' : 'Live Production'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ORDERS & DPAY */}
      {tab === 'orders' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono text-xs text-white">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-slate-300">
                      <div>{o.customerEmail}</div>
                      {o.customerPhone && (
                        <div className="text-xs text-slate-500">{o.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {o.items.map((i) => `${i.quantity}x ${i.bundleName}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-400">
                      {formatPkr(o.amountPkr)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-xs text-slate-200">
                        {o.status}
                      </span>
                      {o.lastError && (
                        <div className="text-[11px] text-rose-400 mt-1 max-w-xs truncate">
                          {o.lastError}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {(o.status === 'FAILED' ||
                        o.status === 'AMBIGUOUS' ||
                        o.status === 'PENDING_PAYMENT') && (
                        <button
                          onClick={async () => {
                            await apiFetch(`/api/admin/orders/${o.id}/retry-provision`, {
                              method: 'POST',
                            });
                            notify(`Provisioned ${o.orderNumber}`);
                            await loadAll();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold"
                        >
                          Provision / Retry
                        </button>
                      )}
                      {o.status === 'PROVISIONED' && o.dpaySessionId && (
                        <button
                          onClick={async () => {
                            if (!window.confirm('Issue DPay refund for this order?')) return;
                            await apiFetch(`/api/admin/orders/${o.id}/refund-dpay`, {
                              method: 'POST',
                              body: JSON.stringify({ reason: 'Admin initiated refund' }),
                            });
                            notify(`Refunded ${o.orderNumber}`);
                            await loadAll();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-xs"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ESIMS & BULK VOUCHERS */}
      {tab === 'esims' && (
        <div className="space-y-6">
          <form
            onSubmit={handleIssueBulk}
            className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-wrap items-end gap-4"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Issue Bulk / Voucher eSIMs (Yesim Plan ID)
              </label>
              <input
                type="text"
                value={bulkPlanId}
                onChange={(e) => setBulkPlanId(e.target.value)}
                placeholder="e.g. c9b922d6a687dc41955220eb30283c6e"
                className="w-72 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Count</label>
              <input
                type="number"
                min={1}
                max={50}
                value={bulkCount}
                onChange={(e) => setBulkCount(Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 pb-2">
              <input
                type="checkbox"
                checked={bulkVoucher}
                onChange={(e) => setBulkVoucher(e.target.checked)}
                className="accent-emerald-500"
              />
              Issue as Voucher Codes
            </label>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5"
            >
              <PackagePlus className="w-4 h-4" />
              Issue Bulk eSIMs
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={esimSearch}
                onChange={(e) => setEsimSearch(e.target.value)}
                placeholder="Filter by ICCID, email, voucher..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">ICCID</th>
                    <th className="px-4 py-3">Customer / Voucher</th>
                    <th className="px-4 py-3">Data Remaining</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Yesim Lifecycle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {esims
                    .filter((e) => {
                      if (!esimSearch.trim()) return true;
                      const q = esimSearch.toLowerCase();
                      return (
                        e.iccid.toLowerCase().includes(q) ||
                        (e.customerEmail || '').toLowerCase().includes(q) ||
                        (e.voucherCode || '').toLowerCase().includes(q)
                      );
                    })
                    .map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-3 font-mono font-bold text-white">{e.iccid}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {e.customerEmail || (e.voucherCode ? `Voucher: ${e.voucherCode}` : '—')}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {e.isUnlimited
                            ? `Unlimited (Used ${formatMbToReadable(e.dataUsedMb)})`
                            : `${formatMbToReadable(e.dataLeftMb)} / ${formatMbToReadable(e.dataPackageMb)}`}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              e.isDeleted
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {e.isDeleted ? 'Replaced' : e.statusQr}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/esims/${e.id}/sync`, { method: 'POST' });
                              notify(`Synced ${e.iccid}`);
                              await loadAll();
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                          >
                            Sync
                          </button>
                          {!e.isDeleted && (
                            <button
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Replace eSIM ${e.iccid} via Yesim /change_esim (transfers active plan)?`,
                                  )
                                )
                                  return;
                                await apiFetch(`/api/admin/esims/${e.id}/replace`, {
                                  method: 'POST',
                                });
                                notify(`Issued replacement eSIM!`);
                                await loadAll();
                              }}
                              className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300"
                            >
                              Replace
                            </button>
                          )}
                          {!e.isDeleted && e.activePlanId && (
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Cancel active plan on ${e.iccid}?`)) return;
                                await apiFetch(`/api/admin/esims/${e.id}/cancel-plan`, {
                                  method: 'POST',
                                });
                                notify(`Cancelled active plan on ${e.iccid}`);
                                await loadAll();
                              }}
                              className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300"
                            >
                              Cancel Plan
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS & WEBHOOKS */}
      {tab === 'settings' && settingsForm && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4"
          >
            <h2 className="text-lg font-bold text-white">
              Storefront, Yesim Partner &amp; DPay Configuration
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Store Name</label>
                <input
                  type="text"
                  value={settingsForm.storeName}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, storeName: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  WhatsApp Support Number
                </label>
                <input
                  type="text"
                  value={settingsForm.whatsappNumber}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, whatsappNumber: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Announcement Ticker Message
              </label>
              <input
                type="text"
                value={settingsForm.announcementTicker}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, announcementTicker: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Yesim API Token</label>
                <input
                  type="password"
                  value={settingsForm.yesimApiToken}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, yesimApiToken: e.target.value })
                  }
                  placeholder="Yesim Partner ?token=..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
                <label className="flex items-center gap-2 text-xs text-slate-300 mt-2">
                  <input
                    type="checkbox"
                    checked={settingsForm.yesimMockMode}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, yesimMockMode: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  Yesim Sandbox / Mock Mode
                </label>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  DPay API Key (Bearer dpay_...)
                </label>
                <input
                  type="password"
                  value={settingsForm.dpayApiKey}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, dpayApiKey: e.target.value })
                  }
                  placeholder="dpay_live_... or dpay_test_..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
                <label className="flex items-center gap-2 text-xs text-slate-300 mt-2">
                  <input
                    type="checkbox"
                    checked={settingsForm.dpayMockMode}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, dpayMockMode: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  DPay Sandbox / Mock Mode
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                DPay Webhook Signing Secret (HMAC-SHA256)
              </label>
              <input
                type="password"
                value={settingsForm.dpayWebhookSecret}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, dpayWebhookSecret: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
            >
              Save Settings
            </button>
          </form>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Recent Webhook Events</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {webhooks.length === 0 ? (
                <div className="text-xs text-slate-500">No webhook events recorded yet.</div>
              ) : (
                webhooks.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 uppercase">{w.source}</span>
                      <span className="text-slate-500">
                        {new Date(w.receivedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="font-mono text-slate-200 mt-0.5">{w.eventType}</div>
                    {w.error && <div className="text-rose-400 mt-1">{w.error}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* BUNDLE CREATE / EDIT MODAL */}
      {editingBundle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl my-8 overflow-hidden">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingBundle.id ? `Edit Bundle: ${editingBundle.name}` : 'Create Manual Bundle'}
              </h3>
              <button
                onClick={() => setEditingBundle(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBundle} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Yesim Plan ID + Live Picker */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-emerald-400">
                    Yesim Partner Plan ID (32-char hex) *
                  </label>
                  <button
                    type="button"
                    onClick={openYesimBrowser}
                    className="px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
                  >
                    Browse Yesim Plans
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={editingBundle.yesimPlanId}
                  onChange={(e) =>
                    setEditingBundle({ ...editingBundle, yesimPlanId: e.target.value })
                  }
                  placeholder="e.g. e299479f253a1a82968fd070df904313"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 font-mono text-xs text-white"
                />
              </div>

              {showYesimPicker && (
                <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={yesimFilterText}
                      onChange={(e) => setYesimFilterText(e.target.value)}
                      placeholder="Filter Yesim plans (Pakistan, UAE, Turkey...)"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowYesimPicker(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-800">
                    {yesimPlans
                      .filter(
                        (p) =>
                          !yesimFilterText ||
                          p.name.toLowerCase().includes(yesimFilterText.toLowerCase()) ||
                          p.countries_included
                            .toLowerCase()
                            .includes(yesimFilterText.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyYesimPlanToForm(p)}
                          className="w-full py-2 px-2 text-left hover:bg-slate-900 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{p.name}</span>
                            <span className="text-slate-400 ml-2">
                              ({p.data} {p.data === 'Unlimited' ? '' : 'GB'} • {p.days}d)
                            </span>
                          </div>
                          <span className="font-mono text-emerald-400">
                            €{p.price} {p.currency}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Sheet Row Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Plan Name *</label>
                  <input
                    type="text"
                    required
                    value={editingBundle.name}
                    onChange={(e) => setEditingBundle({ ...editingBundle, name: e.target.value })}
                    placeholder="15 GB 30 Days"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={editingBundle.sortOrder}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, sortOrder: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Price (PKR) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editingBundle.pricePkr}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, pricePkr: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Actual Price (PKR)</label>
                  <input
                    type="number"
                    value={editingBundle.actualPricePkr}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, actualPricePkr: e.target.value })
                    }
                    placeholder="Auto strikethrough"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Discount % (Auto)</label>
                  <input
                    type="number"
                    value={editingBundle.discountPct}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, discountPct: e.target.value })
                    }
                    placeholder="Auto"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Price Diff (Auto)</label>
                  <input
                    type="number"
                    value={editingBundle.priceDifferencePkr}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, priceDifferencePkr: e.target.value })
                    }
                    placeholder="Auto"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">GBs Label *</label>
                  <input
                    type="text"
                    required
                    value={editingBundle.dataLabel}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, dataLabel: e.target.value })
                    }
                    placeholder="15 GB or Unlimited Data"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Numeric GB</label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={editingBundle.isUnlimited}
                    value={editingBundle.dataGb}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, dataGb: e.target.value })
                    }
                    placeholder="15"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Validity Days *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editingBundle.validityDays}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, validityDays: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Country ISO2</label>
                  <input
                    type="text"
                    value={editingBundle.countryCode}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, countryCode: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              {/* Wholesale Cost & Commission Row (Google Sheet Parity) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cost (EUR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingBundle.costEur}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, costEur: e.target.value })
                    }
                    placeholder="6.42"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">EUR to PKR</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingBundle.eurToPkr}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, eurToPkr: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cost (PKR)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingBundle.costPkr}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, costPkr: e.target.value })
                    }
                    placeholder="Auto from EUR"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Commission (PKR)</label>
                  <input
                    type="number"
                    step="1"
                    value={editingBundle.commissionPkr}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, commissionPkr: e.target.value })
                    }
                    placeholder="Auto (Price - Cost)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-teal-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={editingBundle.contact}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, contact: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Promo Message</label>
                  <input
                    type="text"
                    value={editingBundle.message}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, message: e.target.value })
                    }
                    placeholder="Optional plan note"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={editingBundle.isUnlimited}
                    onChange={(e) =>
                      setEditingBundle({
                        ...editingBundle,
                        isUnlimited: e.target.checked,
                        dataLabel: e.target.checked ? 'Unlimited Data' : editingBundle.dataLabel,
                      })
                    }
                    className="accent-emerald-500"
                  />
                  Unlimited Data
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={editingBundle.isReloadable}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, isReloadable: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  Reloadable
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={editingBundle.isMostPopular}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, isMostPopular: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  Most Popular Badge
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={editingBundle.isActive}
                    onChange={(e) =>
                      setEditingBundle({ ...editingBundle, isActive: e.target.checked })
                    }
                    className="accent-emerald-500"
                  />
                  Published on Storefront
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingBundle(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingBundle.id ? 'Save Changes' : 'Create Bundle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
