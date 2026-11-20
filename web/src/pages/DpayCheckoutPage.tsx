import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatPkr } from '../lib/api';

export function DpayCheckoutPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<{
    sessionId: string;
    orderId: string;
    amountPkr: number;
    currency: string;
    customerEmail: string;
    status: string;
    accessToken: string;
    bundleName: string;
  } | null>(null);
  const [method, setMethod] = useState<'easypaisa' | 'jazzcash' | 'raast' | 'card'>('easypaisa');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSandboxSession(sessionId)
      .then(setSession)
      .catch((err) => setError(err?.message || 'DPay session unavailable'));
  }, [sessionId]);

  async function complete(outcome: 'succeeded' | 'failed') {
    setProcessing(true);
    try {
      const res = await api.completeSandboxSession(sessionId, outcome);
      navigate(res.returnUrl);
    } catch (err: any) {
      setError(err?.message || 'Payment verification failed');
      setProcessing(false);
    }
  }

  return (
    <div className="pt-[110px] pb-20 bg-[#f5f6f1] min-h-[80vh]">
      <div className="pt-container max-w-lg">
        <div className="rounded-[26px] bg-white border border-[#071322]/15 shadow-2xl overflow-hidden">
          <div className="bg-[#071322] text-white p-7 border-b-4 border-[#c8ff43]">
            <span className="font-mono-pt text-[10px] uppercase tracking-[0.12em] text-[#c8ff43]">
              DPay Pakistan • Sandbox Checkout
            </span>
            <h1 className="font-display text-2xl font-semibold mt-1">
              Complete PKR Payment
            </h1>
          </div>

          <div className="p-7 space-y-5">
            {error ? (
              <div className="rounded-xl bg-[#ff7a6b]/20 border border-[#ff7a6b] p-4 text-xs text-[#7b1e14]">
                {error}
              </div>
            ) : !session ? (
              <p className="text-xs font-mono-pt text-[#071322]/60">Loading DPay session…</p>
            ) : (
              <>
                <div className="rounded-2xl bg-[#f5f6f1] border border-[#071322]/10 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#071322]/60">Plan</span>
                    <strong className="text-sm">{session.bundleName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#071322]/60">Deliver eSIM To</span>
                    <span className="font-mono-pt font-bold">{session.customerEmail}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#071322]/10">
                    <span className="font-bold uppercase font-mono-pt">Amount Due</span>
                    <strong className="font-display text-2xl">{formatPkr(session.amountPkr)}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['easypaisa', 'Easypaisa Wallet'],
                        ['jazzcash', 'JazzCash Wallet'],
                        ['raast', 'Raast Instant ID'],
                        ['card', 'Visa / Mastercard'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMethod(id)}
                        className={`rounded-xl border px-3 py-3 text-xs font-bold text-left ${
                          method === id
                            ? 'bg-[#071322] text-[#c8ff43] border-[#071322]'
                            : 'bg-white border-[#071322]/15 text-[#071322]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => complete('succeeded')}
                    className="pt-btn pt-btn--lime w-full"
                  >
                    {processing
                      ? 'Confirming payment.succeeded & sending Mailjet eSIM…'
                      : `Pay ${formatPkr(session.amountPkr)} Now ↗`}
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => complete('failed')}
                    className="pt-btn bg-transparent border border-[#071322]/20 text-[#071322] w-full text-xs"
                  >
                    Cancel / Simulate Failed Payment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
