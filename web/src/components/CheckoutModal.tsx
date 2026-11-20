import React, { useState } from 'react';
import { Lock, Loader2, Mail, Phone, ShieldCheck, X, Zap } from 'lucide-react';
import { apiFetch, formatPkr, PublicBundle } from '../lib/api';
import { useAuth } from '../lib/auth';

export function CheckoutModal({
  bundle,
  onClose,
}: {
  bundle: PublicBundle | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bundle) return null;

  const totalPkr = bundle.pricePkr * quantity;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const origin = window.location.origin;
      const res = await apiFetch<{
        id: string;
        orderNumber: string;
        checkoutUrl: string;
        guestAccessToken: string;
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          bundleId: bundle.id,
          quantity,
          customerEmail: email.trim(),
          customerPhone: phone.trim() || undefined,
          cancelUrl: `${origin}/?canceled=${bundle.slug}`,
        }),
      });

      // Navigate to DPay hosted / sandbox checkout URL
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Instant eSIM Checkout
            </span>
            <h3 className="text-lg font-bold text-white">{bundle.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCheckout} className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-200">
                {bundle.dataLabel} • {bundle.validityDays} Days
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {bundle.coverageType} • Hotspot {bundle.hotspotAllowed ? 'Allowed' : 'No'} •{' '}
                {bundle.isReloadable ? 'Reloadable' : 'One-time'}
              </div>
            </div>
            <div className="text-right">
              {bundle.actualPricePkr && bundle.actualPricePkr > bundle.pricePkr && (
                <div className="text-xs text-slate-500 line-through">
                  {formatPkr(bundle.actualPricePkr)}
                </div>
              )}
              <div className="text-lg font-extrabold text-emerald-400">
                {formatPkr(bundle.pricePkr)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Delivery Email Address (for Instant QR Code) *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                WhatsApp / Phone (Optional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Quantity
              </label>
              <select
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none text-sm text-white"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} eSIM{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-400">Total Payable (PKR)</span>
            <span className="text-2xl font-extrabold text-white">
              {formatPkr(totalPkr)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating DPay Session...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Pay {formatPkr(totalPkr)} via DPay
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Instant QR Delivery
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Raast / JazzCash / Cards
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
