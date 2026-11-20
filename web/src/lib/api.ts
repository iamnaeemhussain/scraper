export interface Bundle {
  id: string;
  yesimPackageCode: string;
  name: string;
  countryCode: string;
  countryName: string;
  region: string;
  dataMb: number;
  dataDisplay: string;
  validityDays: number;
  coverage: string;
  planType: string;
  hotspotSupported: boolean;
  activationType: string;
  reloadable: boolean;
  unlimited: boolean;
  pricePkr: number;
  originalPricePkr?: number | null;
  discountPercent?: number;
  costUsdCents: number;
  marginPercent?: number | null;
  badge?: string | null;
  sortOrder: number;
  enabled: boolean;
  notes?: string | null;
}

export interface StoreConfig {
  storeName: string;
  currency: string;
  paymentProvider: string;
  supportWhatsapp: string;
  storeNotice: string;
  compatibilityBrands: number;
  dpaySandboxEnabled?: boolean;
}

export interface ProvisionedEsim {
  id: string;
  orderId: string;
  iccid: string;
  smdpAddress: string | null;
  activationCode: string | null;
  lpa: string | null;
  qrCodeUrl: string | null;
  qrDataUrl?: string | null;
  appleUniversalLink?: string | null;
  status: string;
  totalBytes: string;
  remainingBytes: string;
  usedBytes: string;
  expiresAt: string | null;
  activatedAt: string | null;
  lastSyncedAt?: string | null;
}

export interface OrderDetail {
  id: string;
  kind: 'NEW_ESIM' | 'TOPUP' | string;
  status: 'PENDING' | 'PAID' | 'PROVISIONED' | 'FAILED' | string;
  customerEmail: string;
  customerName?: string | null;
  customerPhone?: string | null;
  amountPkr: number;
  currency: string;
  targetIccid?: string | null;
  checkoutUrl?: string | null;
  failureReason?: string | null;
  emailDeliveryStatus?: string;
  emailSentAt?: string | null;
  createdAt: string;
  bundle: Bundle | null;
  esim: ProvisionedEsim | null;
}

export interface CompatibleDevice {
  brand: string;
  model: string;
  notes: string;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getStoreConfig: () => fetch('/api/store-config').then((r) => parseJson<StoreConfig>(r)),

  getBundles: (params?: { search?: string; country?: string; reloadOnly?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.country) qs.set('country', params.country);
    if (params?.reloadOnly) qs.set('reloadOnly', 'true');
    const q = qs.toString();
    return fetch(`/api/bundles${q ? `?${q}` : ''}`).then((r) => parseJson<Bundle[]>(r));
  },

  searchDevices: (q?: string, brand?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (brand) qs.set('brand', brand);
    return fetch(`/api/compatibility/devices?${qs.toString()}`).then((r) =>
      parseJson<{ supported: boolean; count: number; devices: CompatibleDevice[] }>(r),
    );
  },

  createOrder: (payload: {
    bundleId: string;
    email: string;
    customerName?: string;
    customerPhone?: string;
  }) =>
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) =>
      parseJson<{
        orderId: string;
        status: string;
        amountPkr: number;
        currency: string;
        paymentSessionId: string;
        checkoutUrl: string;
        accessToken: string;
      }>(r),
    ),

  getOrder: (orderId: string, accessToken: string) =>
    fetch(`/api/orders/${encodeURIComponent(orderId)}?accessToken=${encodeURIComponent(accessToken)}`).then(
      (r) => parseJson<OrderDetail>(r),
    ),

  lookupIccid: (iccid: string) =>
    fetch(`/api/esims/lookup/${encodeURIComponent(iccid.trim())}`).then((r) =>
      parseJson<{
        esim: ProvisionedEsim;
        currentBundle: Bundle | null;
        compatibleReloadBundles: Bundle[];
        history: Array<{
          id: string;
          amountPkr: number;
          status: string;
          planName: string;
          dataDisplay: string;
          createdAt: string;
        }>;
      }>(r),
    ),

  createTopup: (payload: {
    iccid: string;
    bundleId: string;
    email: string;
    customerPhone?: string;
  }) =>
    fetch('/api/topups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) =>
      parseJson<{
        topupId: string;
        orderId: string;
        status: string;
        amountPkr: number;
        currency: string;
        paymentSessionId: string;
        checkoutUrl: string;
        accessToken: string;
      }>(r),
    ),

  getSandboxSession: (sessionId: string) =>
    fetch(`/api/dpay-sandbox/sessions/${encodeURIComponent(sessionId)}`).then((r) =>
      parseJson<{
        sessionId: string;
        orderId: string;
        amountPkr: number;
        currency: string;
        customerEmail: string;
        status: string;
        accessToken: string;
        bundleName: string;
      }>(r),
    ),

  completeSandboxSession: (sessionId: string, outcome: 'succeeded' | 'failed') =>
    fetch(`/api/dpay-sandbox/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome }),
    }).then((r) => parseJson<{ ok: boolean; orderId: string; returnUrl: string }>(r)),

  // Secret-route-gated Admin API (never exposes secret route in frontend source)
  verifyAdminGate: async (secretSlug: string): Promise<{ authorizedRoute: boolean; credentialsConfigured: boolean } | null> => {
    const res = await fetch('/api/admin/gate', {
      headers: { 'X-Admin-Secret-Path': secretSlug },
    });
    if (!res.ok) return null;
    return res.json();
  },

  adminLogin: (secretSlug: string, email: string, password: string) =>
    fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret-Path': secretSlug,
      },
      body: JSON.stringify({ email, password }),
    }).then((r) =>
      parseJson<{ accessToken: string; admin: { email: string; role: 'ADMIN' } }>(r),
    ),

  adminFetch: <T = any>(
    secretSlug: string,
    adminToken: string,
    subpath: string,
    init?: RequestInit,
  ) =>
    fetch(`/api/admin${subpath}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret-Path': secretSlug,
        Authorization: `Bearer ${adminToken}`,
        ...(init?.headers || {}),
      },
    }).then((r) => parseJson<T>(r)),
};

export function formatPkr(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString('en-PK')}`;
}

export function formatBytes(bytesStr: string | number): string {
  const bytes = Number(bytesStr || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}
