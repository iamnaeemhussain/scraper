export interface StoreConfig {
  storeName: string;
  tagline: string;
  announcementTicker: string;
  whatsappNumber: string;
  supportEmail: string;
  coverageEmbedUrl: string;
  currency: 'PKR';
  paymentGateway: string;
  esimProvider: string;
}

export interface PublicBundle {
  id: string;
  name: string;
  slug: string;
  pricePkr: number;
  actualPricePkr: number | null;
  discountPct: number | null;
  priceDifferencePkr: number | null;
  currency: 'PKR';
  dataLabel: string;
  dataGb: number | null;
  isUnlimited: boolean;
  validityDays: number;
  isReloadable: boolean;
  isMostPopular: boolean;
  countryCode: string;
  countryName: string;
  coverageType: string;
  planType: string;
  hotspotAllowed: boolean;
  activationType: string;
  operators: string | null;
  yesimPlanId: string;
  contact: string | null;
  message: string | null;
  sortOrder: number;
}

export interface AdminBundle extends PublicBundle {
  costPkr: number | null;
  costEur: number | null;
  commissionPkr: number | null;
  eurToPkr: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCategory {
  type: string;
  brands: {
    brand: string;
    models: { model: string }[];
  }[];
}

export interface EsimRecord {
  id: string;
  iccid: string;
  statusQr: string;
  isDeleted: boolean;
  activePlanId: string | null;
  activePlanName?: string;
  bundleName?: string | null;
  countryCode?: string;
  countryName?: string;
  isUnlimited: boolean;
  dataLeftMb: number | null;
  dataPackageMb: number | null;
  dataUsedMb: number;
  planActivatedAt: string | null;
  planExpiredAt: string | null;
  activationCode: string;
  smdpAddress: string | null;
  matchingId: string | null;
  qrCodeDataUrl: string;
  iosTapLink: string | null;
  esimPassport?: string | null;
  isVoucher?: boolean;
  voucherCode?: string | null;
  voucherStatus?: string | null;
  replacementCount?: number;
  customerEmail?: string | null;
  createdAt: string;
  topUpHistory?: {
    id: string;
    reference: string;
    bundleName: string;
    amountPkr: number;
    status: string;
    completedAt: string | null;
    createdAt: string;
  }[];
  reloadableBundles?: PublicBundle[];
}

const TOKEN_KEY = 'paktel_access_token';
const REFRESH_KEY = 'paktel_refresh_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearStoredTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (Array.isArray(errJson.message)) {
        message = errJson.message.join(', ');
      } else if (errJson.message) {
        message = errJson.message;
      }
    } catch {
      // ignore non-json
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function formatPkr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return 'Rs. 0';
  return `Rs. ${Math.round(Number(amount)).toLocaleString('en-PK')}`;
}

export function formatMbToReadable(mb: number | null | undefined): string {
  if (mb == null) return '—';
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${Math.round(mb)} MB`;
}
