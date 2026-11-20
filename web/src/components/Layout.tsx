import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  MessageCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
  User,
  Wifi,
  LogOut,
} from 'lucide-react';
import type { StoreConfig } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Layout({
  config,
  children,
}: {
  config: StoreConfig | null;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const storeName = config?.storeName || 'Pak-Tel';
  const ticker =
    config?.announcementTicker ||
    "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶";
  const whatsappClean = (config?.whatsappNumber || '923259717066').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${whatsappClean.startsWith('92') ? whatsappClean : `92${whatsappClean.replace(/^0/, '')}`}`;

  const isActive = (path: string) =>
    location.pathname === path
      ? 'text-emerald-400 font-semibold'
      : 'text-slate-300 hover:text-white';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Announcement Ticker */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-900 border-b border-emerald-500/20 overflow-hidden py-2">
        <div className="whitespace-nowrap flex animate-marquee text-xs sm:text-sm font-medium text-emerald-100">
          <span className="mx-8">{ticker}</span>
          <span className="mx-8">{ticker}</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Wifi className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-white">
                {storeName}
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                5G / LTE eSIM
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/" className={isActive('/')}>
              Data Plans
            </Link>
            <Link
              to="/my-esim"
              className={`flex items-center gap-1.5 ${isActive('/my-esim')}`}
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              Check Balance / Top-Up
            </Link>
            <a
              href="/#compatibility"
              className="text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              <Smartphone className="w-4 h-4 text-teal-400" />
              Device Check
            </a>
            <a href="/#faq" className="text-slate-300 hover:text-white">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              to="/my-esim"
              className="md:hidden px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-emerald-300 flex items-center gap-1"
            >
              <QrCode className="w-3.5 h-3.5" />
              ICCID
            </Link>

            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition"
              >
                <ShieldCheck className="w-4 h-4" />
                Admin
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/account"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-medium text-slate-200 flex items-center gap-1.5"
                >
                  <User className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {user.name || user.email.split('@')[0]}
                  </span>
                </Link>
                <button
                  onClick={() => logout()}
                  title="Sign Out"
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs sm:text-sm transition shadow-sm shadow-emerald-500/20"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm text-slate-400">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                <Wifi className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              </div>
              <span className="text-base font-bold text-white">{storeName}</span>
            </div>
            <p className="text-slate-400 max-w-md leading-relaxed">
              {config?.tagline || "Pakistan's Cheapest Data eSIM Provider"}. Instant 5G/4G/LTE
              mobile data for PTA-blocked and unlocked eSIM smartphones. Powered by Yesim global
              carrier infrastructure &amp; DPay instant PKR checkout.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">Self-Service</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="hover:text-emerald-400 transition">
                  Browse Data Bundles
                </Link>
              </li>
              <li>
                <Link to="/my-esim" className="hover:text-emerald-400 transition">
                  Check ICCID Balance &amp; Reload
                </Link>
              </li>
              <li>
                <a href="/#compatibility" className="hover:text-emerald-400 transition">
                  Supported Smartphones
                </a>
              </li>
              <li>
                <Link to="/admin" className="hover:text-emerald-400 transition">
                  Admin Console
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">24/7 Support</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-emerald-400 transition flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  WhatsApp: +{whatsappClean}
                </a>
              </li>
              <li>Email: {config?.supportEmail || 'support@pak-tel.com'}</li>
              <li className="text-xs text-slate-500 pt-2">
                Payments secured by DPay Pakistan (Raast / IBFT / Cards)
              </li>
            </ul>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Support Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/30 transition transform hover:-translate-y-0.5"
      >
        <MessageCircle className="w-5 h-5 fill-slate-950/10" />
        <span className="hidden sm:inline">WhatsApp Help</span>
      </a>
    </div>
  );
}
