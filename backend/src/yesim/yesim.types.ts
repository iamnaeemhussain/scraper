export interface YesimPlan {
  id: string;
  old_id?: string | null;
  name: string;
  days: string;
  data: string; // e.g. "0.49", "15", "Unlimited"
  countries_included: string;
  countryIso2: string;
  mcc: string;
  iso3: string;
  operators: string;
  image: string;
  apn: string;
  plan_type: 'country' | 'region' | string;
  price: string;
  retail_price?: string;
  currency: string;
  data_unit: string;
}

export interface YesimNetworkInfo {
  time?: string;
  lastMcc?: number;
  lastMnc?: number;
  lastRat?: string;
  model?: string;
}

export interface YesimSimInfo {
  id: string;
  iccid: string;
  user_id?: string | null;
  created_at: string;
  active_plan_id: string | null;
  plan_activated_at: string | null;
  plan_expired_at: string | null;
  qrcode: string; // e.g. "LPA:1$smdp.io$K2-26L4KR-5PB4A8"
  status_qr: 'Released' | 'Installed' | 'Enabled' | 'Disabled' | 'Deleted' | string;
  imsi?: string | null;
  msisdn?: string | null;
  is_deleted: '0' | '1' | string;
  data_left_mb?: number | null;
  data_package_mb?: number | null;
  data_used_mb?: number;
  img?: string;
  networkinfo?: YesimNetworkInfo | null;
  ios_tap_link?: string;
  esim_passport?: string;
  is_voucher?: boolean;
  voucher_status?: 'Available' | 'Redeemed' | 'Expired' | string;
  voucher_code?: string;
}

export interface YesimUserResponse {
  user_id: string;
  email: string;
}

export interface YesimUserDetail {
  id: string;
  email: string;
  created_at: string;
  esim_change_count: string;
  esims: YesimSimInfo[];
}

export interface YesimOrderRecord {
  id: string;
  user_id: string;
  iccid: string;
  plan_id: string;
  cost_eur: string;
  created_at: string;
  payment_id: string;
}

export interface YesimDeviceCategory {
  type: 'PHONE' | 'TABLET' | 'LAPTOP' | 'SMARTWATCH' | 'CAR' | string;
  brands: {
    brand: string;
    models: { model: string }[];
  }[];
}

export interface YesimAllowedOperator {
  id: string;
  country: string;
  operator: string;
  tadig: string;
  location_zone: string;
  created_at?: string;
  updated_at?: string;
}

export interface YesimBalance {
  balance: number;
  currency: string;
  mock?: boolean;
}
