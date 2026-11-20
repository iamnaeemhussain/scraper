import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  Smartphone,
} from 'lucide-react';
import { apiFetch, EsimRecord, formatPkr } from '../lib/api';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  customerEmail: string;
  amountPkr: number;
  dpayCheckoutUrl: string | null;
  lastError: string | null;
  createdAt: string;
  items: {
    id: string;
    bundleName: string;
    dataLabel: string;
    validityDays: number;
    quantity: number;
    unitPricePkr: number;
  }[];
  esims: EsimRecord[];
}

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchOrder = async () => {
    if (!orderId) return;
    try {
      const qs = token ? `?token=${encodeURIComponent(token)}` : '';
      const data = await apiFetch<OrderDetail>(`/api/orders/${encodeURIComponent(orderId)}${qs}`);
      setOrder(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId, token]);

  useEffect(() => {
    if (!order) return;
    if (order.status === 'PENDING_PAYMENT' || order.status === 'PROVISIONING') {
      const timer = setInterval(fetchOrder, 3000);
      return () => clearInterval(timer);
    }
  }, [order?.status]);

  const copyValue = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto mb-3" />
        <div className="text-slate-300 text-sm">Loading your order status...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white">Unable to Load Order</h2>
        <p className="text-sm text-slate-400 mt-2">{error || 'Order not found'}</p>
        <Link
          to="/"
          className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm"
        >
          Back to Storefront
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Header Banner */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Order #{order.orderNumber}
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-1 flex items-center gap-2">
            {order.status === 'PROVISIONED' ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                Your eSIM is Ready to Install!
              </>
            ) : order.status === 'PROVISIONING' ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                Issuing Your eSIM via Yesim...
              </>
            ) : order.status === 'PENDING_PAYMENT' ? (
              'Awaiting DPay Payment Confirmation'
            ) : (
              `Order Status: ${order.status}`
            )}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Sent to <span className="text-slate-200">{order.customerEmail}</span> • Total{' '}
            <strong className="text-emerald-400">{formatPkr(order.amountPkr)}</strong>
          </p>
        </div>

        {order.status === 'PENDING_PAYMENT' && order.dpayCheckoutUrl && (
          <a
            href={order.dpayCheckoutUrl}
            className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shrink-0 text-center"
          >
            Complete DPay Payment
          </a>
        )}
      </div>

      {/* Provisioned eSIM Cards */}
      {order.esims && order.esims.length > 0 && (
        <div className="space-y-6">
          {order.esims.map((esim, idx) => (
            <div
              key={esim.id}
              className="rounded-2xl bg-slate-900/90 border border-emerald-500/30 p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-center"
            >
              <div className="flex flex-col items-center text-center">
                <div className="p-3 rounded-2xl bg-white shadow-lg">
                  <img
                    src={esim.qrCodeDataUrl}
                    alt={`eSIM QR ${esim.iccid}`}
                    className="w-48 h-48 object-contain"
                  />
                </div>
                <span className="text-xs text-slate-400 mt-3">
                  eSIM #{idx + 1} • Scan in Phone Settings
                </span>
              </div>

              <div className="md:col-span-2 space-y-4">
                <div>
                  <div className="text-xs text-slate-400">ICCID Number</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-base sm:text-lg text-white">
                      {esim.iccid}
                    </span>
                    <button
                      onClick={() => copyValue(`iccid-${esim.id}`, esim.iccid)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1"
                    >
                      {copied === `iccid-${esim.id}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    Manual Activation Code (LPA)
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                    <code className="text-xs text-emerald-300 font-mono truncate">
                      {esim.activationCode}
                    </code>
                    <button
                      onClick={() => copyValue(`lpa-${esim.id}`, esim.activationCode)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white shrink-0"
                    >
                      {copied === `lpa-${esim.id}` ? 'Copied!' : 'Copy LPA'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  {esim.iosTapLink && (
                    <a
                      href={esim.iosTapLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2"
                    >
                      <Smartphone className="w-4 h-4" />
                      Install on iPhone
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <Link
                    to={`/my-esim?iccid=${esim.iccid}`}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs sm:text-sm flex items-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    Check Live Usage &amp; Reload
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Summary */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
          Order Summary
        </h3>
        <div className="divide-y divide-slate-800">
          {order.items.map((it) => (
            <div key={it.id} className="py-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-semibold text-white">{it.bundleName}</span>
                <span className="text-slate-400 ml-2">
                  ({it.dataLabel} • {it.validityDays} Days) × {it.quantity}
                </span>
              </div>
              <span className="font-bold text-emerald-400">
                {formatPkr(it.unitPricePkr * it.quantity)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
