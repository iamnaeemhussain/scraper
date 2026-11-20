import React, { useState } from 'react';
import { api, Bundle, formatPkr } from '../lib/api';

interface CheckoutModalProps {
  bundle: Bundle | null;
  targetIccid?: string | null;
  onClose: () => void;
}

export function CheckoutModal({ bundle, targetIccid, onClose }: CheckoutModalProps) {
  const [email, setEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bundle) return null;

  const isTopup = Boolean(targetIccid);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isTopup && targetIccid) {
        const res = await api.createTopup({
          iccid: targetIccid,
          bundleId: bundle!.id,
          email: email.trim(),
          customerPhone: customerPhone.trim() || undefined,
        });
        sessionStorage.setItem(`paktel_order_token_${res.orderId}`, res.accessToken);
        window.location.href = res.checkoutUrl;
      } else {
        const res = await api.createOrder({
          bundleId: bundle!.id,
          email: email.trim(),
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
        });
        sessionStorage.setItem(`paktel_order_token_${res.orderId}`, res.accessToken);
        window.location.href = res.checkoutUrl;
      }
    } catch (err: any) {
      setError(err?.message || 'Could not start DPay checkout. Please check payment configuration.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071322]/75 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[24px] bg-[#f5f6f1] text-[#071322] border border-[#071322]/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#071322] text-white px-7 py-6 border-b border-white/10 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-pt text-[10px] uppercase tracking-[0.12em] text-[#c8ff43]">
              {isTopup ? 'Confirm top-up' : 'Instant digital checkout'}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight mt-1">
              Pay with <span className="text-[#c8ff43]">DPay.</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 text-white hover:bg-[#c8ff43] hover:text-[#071322] font-bold transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {/* Summary Card */}
          <div className="rounded-2xl bg-white border border-[#071322]/12 p-4 space-y-2.5 text-sm">
            {isTopup && (
              <div className="flex items-center justify-between gap-3 border-b border-[#071322]/10 pb-2">
                <span className="text-[#071322]/60 text-xs font-semibold">eSIM (ICCID)</span>
                <span className="font-mono-pt text-xs font-bold">{targetIccid}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#071322]/60 text-xs font-semibold">Plan</span>
              <span className="font-bold">{bundle.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#071322]/60 text-xs font-semibold">Allowance / Validity</span>
              <span className="font-mono-pt text-xs font-bold">
                {bundle.dataDisplay} • {bundle.validityDays}{' '}
                {bundle.validityDays === 1 ? 'Day' : 'Days'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#071322]/10">
              <span className="text-[#071322]/70 text-xs font-bold uppercase font-mono-pt">
                Total (PKR)
              </span>
              <span className="font-display text-2xl font-bold tracking-tight text-[#071322]">
                {formatPkr(bundle.pricePkr)}
              </span>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-[#071322] mb-1.5">
                Delivery Email Address <span className="text-[#db6e55]">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[#071322]/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#071322] focus:ring-2 focus:ring-[#071322]/10"
              />
              <p className="mt-1 text-[11px] text-[#071322]/60">
                No account signup required. Your eSIM QR code &amp; activation details will be
                delivered to this email via Mailjet as soon as payment succeeds.
              </p>
            </div>

            {!isTopup && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#071322]/80 mb-1.5">
                    Your Name (optional)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ali Khan"
                    className="w-full rounded-xl border border-[#071322]/20 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#071322]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#071322]/80 mb-1.5">
                    WhatsApp / Phone (optional)
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    className="w-full rounded-xl border border-[#071322]/20 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#071322]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* DPay Notice matching my.pak-tel.com */}
          <div className="rounded-xl bg-[#e9ebe4] border border-[#071322]/10 p-3.5 flex items-start gap-3 text-xs text-[#071322]/80">
            <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-[#071322] text-[#c8ff43] font-mono-pt font-bold shrink-0">
              PK
            </span>
            <div>
              <strong className="block text-[#071322]">Bank transfer, wallet, or card</strong>
              Pay securely via Pakistani wallets (Easypaisa, JazzCash, Raast) or bank card on
              DPay. Your {isTopup ? 'top-up' : 'eSIM'} activates automatically once verified.
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-[#ff7a6b]/20 border border-[#ff7a6b] px-4 py-3 text-xs font-semibold text-[#7b1e14]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="pt-btn bg-transparent border border-[#071322]/20 text-[#071322] hover:border-[#071322]"
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="pt-btn pt-btn--lime">
              {submitting ? 'Connecting to DPay…' : 'Continue to payment ↗'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
