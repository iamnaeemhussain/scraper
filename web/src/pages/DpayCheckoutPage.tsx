import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatPkr } from '../lib/api';

interface SandboxSession {
  id: string;
  amount: number;
  payable_amount: number;
  currency: 'PKR';
  status: string;
  reference: string;
  description?: string;
  customer_email?: string | null;
  success_url?: string;
  cancel_url?: string;
}

export function DpayCheckoutPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SandboxSession | null>(null);
  const [method, setMethod] = useState<'raast' | 'wallet' | 'card'>('raast');
  const [payerAccount, setPayerAccount] = useState('0325-9717066');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    apiFetch<SandboxSession>(`/api/dpay-sandbox/sessions/${encodeURIComponent(sessionId)}`)
      .then((s) => setSession(s))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const triggerOutcome = async (outcome: 'succeeded' | 'failed' | 'canceled') => {
    if (!sessionId) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await apiFetch<{ redirectUrl: string }>(
        `/api/dpay-sandbox/sessions/${encodeURIComponent(sessionId)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            outcome,
            payerAccountNumber: `${payerAccount} (${method.toUpperCase()})`,
          }),
        },
      );
      window.location.href = res.redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Initializing DPay Pakistan Secure Session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <p className="text-rose-400 text-sm">{error || 'DPay session not found'}</p>
      </div>
    );
  }

  const pkrRupees = Math.round((session.payable_amount || session.amount) / 100);

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* DPay Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-950 to-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-white">DPay</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase">
                Sandbox Mode
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Ref: <span className="font-mono text-slate-300">{session.reference}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Payable Amount</div>
            <div className="text-2xl font-black text-emerald-400">
              {formatPkr(pkrRupees)}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-300">
            <div className="font-semibold text-white">{session.description}</div>
            {session.customer_email && (
              <div className="text-xs text-slate-400 mt-1">
                QR Delivery: {session.customer_email}
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Select Pakistan Payment Rail
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'raast', label: 'Raast ID', icon: Building2 },
                { id: 'wallet', label: 'JazzCash / EP', icon: Smartphone },
                { id: 'card', label: 'PKR Card', icon: CreditCard },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id as 'raast' | 'wallet' | 'card')}
                    className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition ${
                      method === m.id
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Payer Mobile / Account Number
            </label>
            <input
              type="text"
              value={payerAccount}
              onChange={(e) => setPayerAccount(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => triggerOutcome('succeeded')}
              disabled={processing}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Authorize {formatPkr(pkrRupees)} (Signed HMAC Webhook)
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => triggerOutcome('failed')}
                disabled={processing}
                className="py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                Simulate Failed
              </button>
              <button
                onClick={() => triggerOutcome('canceled')}
                disabled={processing}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel &amp; Return
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-400" /> HMAC-SHA256 DPay-Signature
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Instant Yesim Provisioning
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
