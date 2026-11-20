export type DpaySessionStatus =
  | 'open'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'canceled'
  | 'ambiguous';

export interface DpayCreateSessionInput {
  idempotencyKey: string;
  amountPaisa: number;
  reference: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  customerPhone?: string;
  expiresInSeconds?: number;
  rounding?: 'round' | 'floor' | 'ceil';
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DpayPaymentSession {
  id: string;
  amount: number;
  payable_amount: number;
  amount_paid?: number;
  currency: 'PKR';
  status: DpaySessionStatus;
  checkout_url: string;
  reference: string;
  description?: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  success_url?: string;
  cancel_url?: string;
  payer_account_number?: string | null;
  external_payment_ref?: string | null;
  expires_at: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
  mock?: boolean;
}

export type DpayWebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.ambiguous'
  | 'payment.refunded'
  | 'payment.disputed'
  | 'test.ping';

export interface DpayWebhookPayload {
  id: string;
  type: DpayWebhookEventType | string;
  created_at: string;
  data: {
    session_id?: string;
    reference?: string;
    status?: DpaySessionStatus;
    amount?: number;
    payable_amount?: number;
    amount_paid?: number;
    currency?: 'PKR';
    payer_account_number?: string;
    external_payment_ref?: string;
    paid_at?: string;
    failure_reason?: string;
    metadata?: Record<string, unknown>;
  };
}
