import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  email: text('email').notNull().unique(),
  name: text('name'),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('USER'), // 'USER' | 'ADMIN'
  yesimUserId: text('yesim_user_id'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  locale: text('locale').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  userId: text('user_id').notNull(),
  fcmToken: text('fcm_token').notNull().unique(),
  platform: text('platform').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeSettings = pgTable('store_settings', {
  id: text('id').primaryKey(), // singleton 'default'
  storeName: text('store_name').notNull().default('Pak-Tel'),
  tagline: text('tagline').notNull().default("Pakistan's Cheapest Data eSIM Provider"),
  announcementBanner: text('announcement_banner')
    .notNull()
    .default(
      "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
    ),
  whatsappContact: text('whatsapp_contact').notNull().default('923259717066'),
  supportEmail: text('support_email').notNull().default('support@pak-tel.com'),
  eurToPkrRate: doublePrecision('eur_to_pkr_rate').notNull().default(303.8602),
  coverageEmbedUrl: text('coverage_embed_url')
    .notNull()
    .default('https://coverage.yesim.biz/embed'),
  yesimBaseUrl: text('yesim_base_url').notNull().default('https://partners-api.yesim.biz'),
  yesimApiToken: text('yesim_api_token'),
  yesimWebhookUrl: text('yesim_webhook_url'),
  yesimMockMode: boolean('yesim_mock_mode').notNull().default(false),
  dpayBaseUrl: text('dpay_base_url').notNull().default('https://api.dpay.com.pk/v1'),
  dpayApiKey: text('dpay_api_key'),
  dpayWebhookSecret: text('dpay_webhook_secret'),
  dpayOutlet: text('dpay_outlet'),
  dpayMockMode: boolean('dpay_mock_mode').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bundles = pgTable('bundles', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(), // Plan Name
  yesimPlanId: text('yesim_plan_id').notNull(), // Plan ID
  pricePkr: integer('price_pkr').notNull(), // Price (PKR)
  actualPricePkr: integer('actual_price_pkr'), // Actual Price
  discountPct: integer('discount_pct').notNull().default(0), // Discount %
  priceDifferencePkr: integer('price_difference_pkr').notNull().default(0), // Price difference
  dataLabel: text('data_label').notNull(), // GBs (e.g. "15 GB", "0.5 GB", "Unlimited Data")
  dataGb: doublePrecision('data_gb'), // numeric GBs, null when unlimited
  isUnlimited: boolean('is_unlimited').notNull().default(false),
  validityDays: integer('validity_days').notNull(), // Days
  isReloadable: boolean('is_reloadable').notNull().default(true), // Reloadable
  isMostPopular: boolean('is_most_popular').notNull().default(false), // Most Popular
  costPkr: doublePrecision('cost_pkr'), // Cost
  costEur: doublePrecision('cost_eur'),
  eurToPkr: doublePrecision('eur_to_pkr').notNull().default(303.8602), // EUR to PKR
  commissionPkr: doublePrecision('commission_pkr'), // Comission
  contact: text('contact'), // Contact
  message: text('message'), // Message
  countryCode: text('country_code').notNull().default('PK'),
  countryName: text('country_name').notNull().default('Pakistan'),
  coverageType: text('coverage_type').notNull().default('5G/4G/LTE'),
  operators: text('operators'),
  planType: text('plan_type').notNull().default('Data only'),
  hotspotAllowed: boolean('hotspot_allowed').notNull().default(true),
  activationType: text('activation_type').notNull().default('Instant'),
  apn: text('apn').notNull().default('plus'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  orderNumber: text('order_number').notNull().unique(),
  guestAccessToken: text('guest_access_token').notNull().unique(),
  userId: text('user_id'),
  customerEmail: text('customer_email').notNull(),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  dpaySessionId: text('dpay_session_id').unique(),
  dpayCheckoutUrl: text('dpay_checkout_url'),
  payerAccountNumber: text('payer_account_number'),
  amountPkr: integer('amount_pkr').notNull(),
  amountPaisa: integer('amount_paisa').notNull(),
  payableAmountPaisa: integer('payable_amount_paisa'),
  amountPaidPaisa: integer('amount_paid_paisa'),
  currency: text('currency').notNull().default('PKR'),
  status: text('status').notNull().default('PENDING_PAYMENT'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
  lastError: text('last_error'),
});

export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  orderId: text('order_id').notNull(),
  bundleId: text('bundle_id'),
  yesimPlanId: text('yesim_plan_id').notNull(),
  bundleName: text('bundle_name').notNull(),
  dataLabel: text('data_label').notNull().default(''),
  validityDays: integer('validity_days').notNull().default(30),
  quantity: integer('quantity').notNull().default(1),
  unitPricePkr: integer('unit_price_pkr').notNull(),
  unitPricePaisa: integer('unit_price_paisa').notNull(),
});

export const esims = pgTable('esims', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  userId: text('user_id'),
  orderId: text('order_id'),
  orderItemId: text('order_item_id'),
  bundleId: text('bundle_id'),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  yesimEsimId: text('yesim_esim_id'),
  yesimUserId: text('yesim_user_id'),
  iccid: text('iccid').notNull().unique(),
  imsi: text('imsi'),
  msisdn: text('msisdn'),
  activePlanId: text('active_plan_id'),
  activationCode: text('activation_code').notNull(),
  smdpAddress: text('smdp_address'),
  matchingId: text('matching_id'),
  qrCodeDataUrl: text('qr_code_data_url').notNull(),
  flagImageUrl: text('flag_image_url'),
  iosTapLink: text('ios_tap_link'),
  esimPassport: text('esim_passport'),
  statusQr: text('status_qr').notNull().default('Released'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  isUnlimited: boolean('is_unlimited').notNull().default(false),
  dataPackageMb: doublePrecision('data_package_mb'),
  dataLeftMb: doublePrecision('data_left_mb'),
  dataUsedMb: doublePrecision('data_used_mb').notNull().default(0),
  planActivatedAt: timestamp('plan_activated_at', { withTimezone: true }),
  planExpiredAt: timestamp('plan_expired_at', { withTimezone: true }),
  apn: text('apn').default('plus'),
  networkInfo: jsonb('network_info').$type<Record<string, unknown> | null>(),
  isVoucher: boolean('is_voucher').notNull().default(false),
  voucherCode: text('voucher_code'),
  voucherStatus: text('voucher_status'),
  replacementCount: integer('replacement_count').notNull().default(0),
  replacedFromId: text('replaced_from_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const topUps = pgTable('top_ups', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  reference: text('reference').notNull().unique(),
  esimId: text('esim_id').notNull(),
  iccid: text('iccid').notNull(),
  userId: text('user_id'),
  customerEmail: text('customer_email'),
  bundleId: text('bundle_id').notNull(),
  bundleName: text('bundle_name').notNull(),
  dpaySessionId: text('dpay_session_id').unique(),
  dpayCheckoutUrl: text('dpay_checkout_url'),
  amountPkr: integer('amount_pkr').notNull(),
  amountPaisa: integer('amount_paisa').notNull(),
  payableAmountPaisa: integer('payable_amount_paisa'),
  amountPaidPaisa: integer('amount_paid_paisa'),
  currency: text('currency').notNull().default('PKR'),
  status: text('status').notNull().default('PENDING_PAYMENT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastError: text('last_error'),
});

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey().$defaultFn(() => uuidv4()),
  source: text('source').notNull(), // 'dpay' | 'yesim'
  externalId: text('external_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
});

export type UserRow = typeof users.$inferSelect;
export type StoreSettingsRow = typeof storeSettings.$inferSelect;
export type BundleRow = typeof bundles.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type EsimRow = typeof esims.$inferSelect;
export type TopUpRow = typeof topUps.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;

export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  yesim_user_id TEXT,
  email_verified_at TIMESTAMPTZ,
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL DEFAULT 'Pak-Tel',
  tagline TEXT NOT NULL DEFAULT 'Pakistan''s Cheapest Data eSIM Provider',
  announcement_banner TEXT NOT NULL DEFAULT 'Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan''s Cheapest Data eSIM Provider 🇵🇰📶',
  whatsapp_contact TEXT NOT NULL DEFAULT '923259717066',
  support_email TEXT NOT NULL DEFAULT 'support@pak-tel.com',
  eur_to_pkr_rate DOUBLE PRECISION NOT NULL DEFAULT 303.8602,
  coverage_embed_url TEXT NOT NULL DEFAULT 'https://coverage.yesim.biz/embed',
  yesim_base_url TEXT NOT NULL DEFAULT 'https://partners-api.yesim.biz',
  yesim_api_token TEXT,
  yesim_webhook_url TEXT,
  yesim_mock_mode BOOLEAN NOT NULL DEFAULT FALSE,
  dpay_base_url TEXT NOT NULL DEFAULT 'https://api.dpay.com.pk/v1',
  dpay_api_key TEXT,
  dpay_webhook_secret TEXT,
  dpay_outlet TEXT,
  dpay_mock_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  yesim_plan_id TEXT NOT NULL,
  price_pkr INTEGER NOT NULL,
  actual_price_pkr INTEGER,
  discount_pct INTEGER NOT NULL DEFAULT 0,
  price_difference_pkr INTEGER NOT NULL DEFAULT 0,
  data_label TEXT NOT NULL,
  data_gb DOUBLE PRECISION,
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  validity_days INTEGER NOT NULL,
  is_reloadable BOOLEAN NOT NULL DEFAULT TRUE,
  is_most_popular BOOLEAN NOT NULL DEFAULT FALSE,
  cost_pkr DOUBLE PRECISION,
  cost_eur DOUBLE PRECISION,
  eur_to_pkr DOUBLE PRECISION NOT NULL DEFAULT 303.8602,
  commission_pkr DOUBLE PRECISION,
  contact TEXT,
  message TEXT,
  country_code TEXT NOT NULL DEFAULT 'PK',
  country_name TEXT NOT NULL DEFAULT 'Pakistan',
  coverage_type TEXT NOT NULL DEFAULT '5G/4G/LTE',
  operators TEXT,
  plan_type TEXT NOT NULL DEFAULT 'Data only',
  hotspot_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  activation_type TEXT NOT NULL DEFAULT 'Instant',
  apn TEXT NOT NULL DEFAULT 'plus',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bundles_active_sort ON bundles(is_active, sort_order);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  guest_access_token TEXT NOT NULL UNIQUE,
  user_id TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  dpay_session_id TEXT UNIQUE,
  dpay_checkout_url TEXT,
  payer_account_number TEXT,
  amount_pkr INTEGER NOT NULL,
  amount_paisa INTEGER NOT NULL,
  payable_amount_paisa INTEGER,
  amount_paid_paisa INTEGER,
  currency TEXT NOT NULL DEFAULT 'PKR',
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  provisioned_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_dpay_session ON orders(dpay_session_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bundle_id TEXT,
  yesim_plan_id TEXT NOT NULL,
  bundle_name TEXT NOT NULL,
  data_label TEXT NOT NULL DEFAULT '',
  validity_days INTEGER NOT NULL DEFAULT 30,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_pkr INTEGER NOT NULL,
  unit_price_paisa INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS esims (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  order_id TEXT,
  order_item_id TEXT,
  bundle_id TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  yesim_esim_id TEXT,
  yesim_user_id TEXT,
  iccid TEXT NOT NULL UNIQUE,
  imsi TEXT,
  msisdn TEXT,
  active_plan_id TEXT,
  activation_code TEXT NOT NULL,
  smdp_address TEXT,
  matching_id TEXT,
  qr_code_data_url TEXT NOT NULL,
  flag_image_url TEXT,
  ios_tap_link TEXT,
  esim_passport TEXT,
  status_qr TEXT NOT NULL DEFAULT 'Released',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  data_package_mb DOUBLE PRECISION,
  data_left_mb DOUBLE PRECISION,
  data_used_mb DOUBLE PRECISION NOT NULL DEFAULT 0,
  plan_activated_at TIMESTAMPTZ,
  plan_expired_at TIMESTAMPTZ,
  apn TEXT DEFAULT 'plus',
  network_info JSONB,
  is_voucher BOOLEAN NOT NULL DEFAULT FALSE,
  voucher_code TEXT,
  voucher_status TEXT,
  replacement_count INTEGER NOT NULL DEFAULT 0,
  replaced_from_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esims_user_id ON esims(user_id);
CREATE INDEX IF NOT EXISTS idx_esims_order_id ON esims(order_id);
CREATE INDEX IF NOT EXISTS idx_esims_iccid ON esims(iccid);

CREATE TABLE IF NOT EXISTS top_ups (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  esim_id TEXT NOT NULL,
  iccid TEXT NOT NULL,
  user_id TEXT,
  customer_email TEXT,
  bundle_id TEXT NOT NULL,
  bundle_name TEXT NOT NULL,
  dpay_session_id TEXT UNIQUE,
  dpay_checkout_url TEXT,
  amount_pkr INTEGER NOT NULL,
  amount_paisa INTEGER NOT NULL,
  payable_amount_paisa INTEGER,
  amount_paid_paisa INTEGER,
  currency TEXT NOT NULL DEFAULT 'PKR',
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_top_ups_iccid ON top_ups(iccid);
CREATE INDEX IF NOT EXISTS idx_top_ups_dpay_session ON top_ups(dpay_session_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT,
  UNIQUE(source, external_id)
);
`;
