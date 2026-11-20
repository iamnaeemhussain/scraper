import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ExternalLink, Loader2, QrCode, ShoppingBag } from 'lucide-react';
import { apiFetch, EsimRecord, formatMbToReadable, formatPkr } from '../lib/api';
import { useAuth } from '../lib/auth';

interface MyOrder {
  id: string;
  orderNumber: string;
  status: string;
  amountPkr: number;
  createdAt: string;
}

export function AccountPage() {
  const { user, loading: authLoading } = useAuth();
  const [esims, setEsims] = useState<EsimRecord[]>([]);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiFetch<EsimRecord[]>('/api/esims'),
      apiFetch<MyOrder[]>('/api/orders'),
    ])
      .then(([e, o]) => {
        setEsims(e);
        setOrders(o);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            My Pak-Tel Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">{user.email}</p>
        </div>
        <Link
          to="/"
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
        >
          + Buy New Data Plan
        </Link>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
        </div>
      ) : (
        <>
          {/* My eSIMs */}
          <section>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-400" />
              My eSIM Profiles ({esims.length})
            </h2>
            {esims.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-sm text-slate-400 text-center">
                You don&apos;t have any active eSIMs yet. Choose a bundle on the storefront to
                get started!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {esims.map((e) => (
                  <div
                    key={e.id}
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-emerald-400">
                        {e.bundleName || 'Pak-Tel Data eSIM'}
                      </div>
                      <div className="font-mono font-bold text-white text-sm">{e.iccid}</div>
                      <div className="text-xs text-slate-400">
                        {e.isUnlimited
                          ? `Unlimited (Used ${formatMbToReadable(e.dataUsedMb)})`
                          : `Remaining: ${formatMbToReadable(e.dataLeftMb)} / ${formatMbToReadable(e.dataPackageMb)}`}
                      </div>
                      <Link
                        to={`/my-esim?iccid=${e.iccid}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 pt-2"
                      >
                        Manage &amp; Reload <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                    <img
                      src={e.qrCodeDataUrl}
                      alt={e.iccid}
                      className="w-20 h-20 rounded-xl bg-white p-1.5 shrink-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* My Orders */}
          <section>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-400" />
              Order History ({orders.length})
            </h2>
            {orders.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-sm text-slate-400 text-center">
                No orders yet.
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-3 font-mono text-white">{o.orderNumber}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-400">
                          {formatPkr(o.amountPkr)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-xs text-slate-200">
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/order/${o.id}`}
                            className="text-emerald-400 hover:underline font-semibold text-xs"
                          >
                            View QR →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
