import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, formatPkr, OrderDetail } from '../lib/api';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('accessToken') || '';
  const accessToken =
    tokenFromUrl || sessionStorage.getItem(`paktel_order_token_${orderId}`) || '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId || !accessToken) {
      setError('Missing order access token. Please open the receipt link sent to your email.');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await api.getOrder(orderId, accessToken);
        if (cancelled) return;
        setOrder(res);
        if (res.status === 'PENDING' || res.status === 'PAID') {
          timer = setTimeout(load, 2500);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Unable to load order');
      }
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, accessToken]);

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="pt-[110px] pb-20 bg-[#f5f6f1] min-h-[80vh]">
      <div className="pt-container max-w-3xl">
        {error ? (
          <div className="rounded-[24px] bg-white border border-[#071322]/15 p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-[#071322]">Order Receipt</h1>
            <p className="mt-2 text-sm text-[#7b1e14]">{error}</p>
            <Link to="/" className="pt-btn pt-btn--dark mt-6">
              Back to Pak-Tel Plans
            </Link>
          </div>
        ) : !order ? (
          <div className="rounded-[24px] bg-white border border-[#071322]/15 p-10 text-center">
            <p className="font-mono-pt text-xs uppercase tracking-wider text-[#071322]/60">
              Loading receipt…
            </p>
          </div>
        ) : (
          <div className="rounded-[26px] bg-white border border-[#071322]/15 shadow-xl overflow-hidden">
            <div className="bg-[#071322] text-white p-7 sm:p-9 border-b-4 border-[#c8ff43]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono-pt text-[11px] uppercase tracking-[0.12em] text-[#c8ff43]">
                  Order #{order.id.slice(0, 8).toUpperCase()} • {order.kind}
                </span>
                <span className="rounded-full bg-[#c8ff43] text-[#071322] font-mono-pt text-xs font-bold px-3 py-1">
                  {order.status}
                </span>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-3">
                {order.status === 'PROVISIONED'
                  ? order.kind === 'TOPUP'
                    ? 'Your eSIM top-up is active.'
                    : 'Your Pak-Tel eSIM is ready.'
                  : order.status === 'FAILED'
                    ? 'Payment was not completed.'
                    : 'Confirming payment & provisioning…'}
              </h1>

              <p className="mt-2 text-sm text-white/70">
                Delivery Email: <strong className="text-white">{order.customerEmail}</strong>
                {order.emailDeliveryStatus && order.status === 'PROVISIONED' ? (
                  <span className="ml-2 font-mono-pt text-xs text-[#c8ff43]">
                    (Mailjet: {order.emailDeliveryStatus})
                  </span>
                ) : null}
              </p>
            </div>

            <div className="p-7 sm:p-9 space-y-6">
              <div className="rounded-2xl bg-[#f5f6f1] border border-[#071322]/10 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[#071322]/55 block">Plan</span>
                  <strong className="text-sm block mt-0.5">{order.bundle?.name || 'eSIM Plan'}</strong>
                </div>
                <div>
                  <span className="text-[#071322]/55 block">Data</span>
                  <strong className="font-mono-pt text-sm block mt-0.5">
                    {order.bundle?.dataDisplay || '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#071322]/55 block">Validity</span>
                  <strong className="font-mono-pt text-sm block mt-0.5">
                    {order.bundle ? `${order.bundle.validityDays} Days` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#071322]/55 block">Total Paid</span>
                  <strong className="font-display text-base block mt-0.5">
                    {formatPkr(order.amountPkr)}
                  </strong>
                </div>
              </div>

              {order.status === 'PENDING' && order.checkoutUrl && (
                <div className="rounded-2xl bg-[#ffad71]/25 border border-[#ffad71] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-xs text-[#071322]">
                    <strong className="block text-sm">Awaiting DPay payment confirmation</strong>
                    Complete your PKR payment on DPay. Once <code>payment.succeeded</code> arrives,
                    your eSIM will appear here and in your email automatically.
                  </div>
                  <a href={order.checkoutUrl} className="pt-btn pt-btn--dark pt-btn--small shrink-0">
                    Open DPay Checkout ↗
                  </a>
                </div>
              )}

              {order.esim && (
                <div className="rounded-2xl bg-[#071322] text-white p-6 sm:p-8 space-y-6">
                  <div className="flex flex-col md:flex-row items-center gap-7">
                    {order.esim.qrDataUrl && (
                      <div className="bg-white p-3.5 rounded-2xl shrink-0">
                        <img
                          src={order.esim.qrDataUrl}
                          alt="Pak-Tel eSIM QR Code"
                          className="w-48 h-48 block"
                        />
                      </div>
                    )}

                    <div className="flex-1 space-y-3 text-xs w-full">
                      <span className="font-mono-pt text-[10px] uppercase tracking-wider text-[#c8ff43]">
                        Scan in Settings → Mobile Data → Add eSIM
                      </span>

                      <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-white/50 block text-[10px]">ICCID</span>
                          <code className="font-mono-pt font-bold text-sm">{order.esim.iccid}</code>
                        </div>
                        <button
                          type="button"
                          onClick={() => copy('iccid', order.esim!.iccid)}
                          className="px-2.5 py-1 rounded bg-white/10 hover:bg-[#c8ff43] hover:text-[#071322] font-bold"
                        >
                          {copied === 'iccid' ? 'Copied ✓' : 'Copy'}
                        </button>
                      </div>

                      {order.esim.lpa && (
                        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-white/50 block text-[10px]">Manual LPA String</span>
                            <code className="font-mono-pt text-xs break-all block">
                              {order.esim.lpa}
                            </code>
                          </div>
                          <button
                            type="button"
                            onClick={() => copy('lpa', order.esim!.lpa!)}
                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-[#c8ff43] hover:text-[#071322] font-bold shrink-0"
                          >
                            {copied === 'lpa' ? 'Copied ✓' : 'Copy'}
                          </button>
                        </div>
                      )}

                      <div className="pt-2 flex flex-wrap gap-2.5">
                        {order.esim.appleUniversalLink && (
                          <a
                            href={order.esim.appleUniversalLink}
                            className="pt-btn pt-btn--lime pt-btn--small"
                          >
                            Install on iPhone (iOS 17.4+) ↗
                          </a>
                        )}
                        <Link
                          to={`/my-esim?iccid=${encodeURIComponent(order.esim.iccid)}`}
                          className="pt-btn pt-btn--ghost-light pt-btn--small"
                        >
                          Live Balance &amp; Top-up ↗
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                <Link to="/" className="text-xs font-bold underline text-[#071322]">
                  ← Back to Pak-Tel Store
                </Link>
                {order.esim && (
                  <Link
                    to={`/my-esim?iccid=${encodeURIComponent(order.esim.iccid)}`}
                    className="text-xs font-bold underline text-[#071322]"
                  >
                    Manage ICCID {order.esim.iccid.slice(-6)} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
