import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, StoreConfig } from '../lib/api';

export const StoreContext = React.createContext<StoreConfig>({
  storeName: 'Pak-Tel eSIM',
  currency: 'PKR',
  paymentProvider: 'DPAY',
  supportWhatsapp: '923259717066',
  storeNotice:
    "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
  compatibilityBrands: 10,
});

export function Layout({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [config, setConfig] = useState<StoreConfig>({
    storeName: 'Pak-Tel eSIM',
    currency: 'PKR',
    paymentProvider: 'DPAY',
    supportWhatsapp: '923259717066',
    storeNotice:
      "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
    compatibilityBrands: 10,
  });
  const location = useLocation();

  useEffect(() => {
    api
      .getStoreConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  const isMyEsim = location.pathname.startsWith('/my-esim');
  const waHref = `https://wa.me/${config.supportWhatsapp}?text=${encodeURIComponent(
    'Hi Pak-Tel, I have a question about eSIM data plans.',
  )}`;

  return (
    <StoreContext.Provider value={config}>
      <div className="min-h-screen flex flex-col bg-[#f5f6f1] text-[#071322]">
        {/* Fixed Frosted Ink Header matching pak-tel.com */}
        <header className={`pt-header ${scrolled ? 'is-scrolled' : ''}`}>
          <div className="pt-container flex items-center justify-between gap-5 min-h-[84px]">
            <Link to="/" className="inline-flex items-center gap-3 shrink-0" aria-label="Pak-Tel Home">
              <img
                src="/ptlogo.png"
                alt="Pak-Tel eSIM"
                className="h-[58px] md:h-[64px] w-auto object-contain"
              />
            </Link>

            <nav className="hidden lg:flex items-center gap-8 ml-auto text-[13px] font-semibold text-[#eff7ff]/75">
              <a href="/#plans" className="hover:text-[#c8ff43] transition-colors">
                Plans
              </a>
              <a href="/#how" className="hover:text-[#c8ff43] transition-colors">
                How it works
              </a>
              <a href="/#why" className="hover:text-[#c8ff43] transition-colors">
                Why Pak-Tel
              </a>
              <a href="/#compatibility" className="hover:text-[#c8ff43] transition-colors">
                Compatibility
              </a>
              <a href="/#faq" className="hover:text-[#c8ff43] transition-colors">
                FAQ
              </a>
            </nav>

            <div className="hidden sm:flex items-center gap-4 ml-4">
              <div className="hidden xl:inline-flex items-center gap-2 font-mono-pt text-[10px] tracking-[0.05em] uppercase text-[#ecf6ff]/70">
                <span className="pt-live-dot" />
                Live Inventory
              </div>

              {isMyEsim ? (
                <Link to="/#plans" className="pt-btn pt-btn--ghost-light pt-btn--small">
                  Browse Data Plans ↗
                </Link>
              ) : (
                <Link to="/my-esim" className="pt-btn pt-btn--ghost-light pt-btn--small">
                  eSIM Top-up ↗
                </Link>
              )}

              <a href="/#plans" className="pt-btn pt-btn--lime pt-btn--small">
                Shop Plans ↗
              </a>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-white/20 text-white"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="sm:hidden border-t border-white/10 bg-[#071322] px-6 py-5 space-y-3 text-sm">
              <a href="/#plans" className="block py-2 text-white/85 hover:text-[#c8ff43]">
                Plans
              </a>
              <a href="/#how" className="block py-2 text-white/85 hover:text-[#c8ff43]">
                How it works
              </a>
              <a href="/#why" className="block py-2 text-white/85 hover:text-[#c8ff43]">
                Why Pak-Tel
              </a>
              <a href="/#compatibility" className="block py-2 text-white/85 hover:text-[#c8ff43]">
                Compatibility
              </a>
              <a href="/#faq" className="block py-2 text-white/85 hover:text-[#c8ff43]">
                FAQ
              </a>
              <div className="pt-2 flex flex-col gap-2.5">
                <Link to="/my-esim" className="pt-btn pt-btn--ghost-light w-full">
                  eSIM Top-up / Check Balance ↗
                </Link>
                <a href="/#plans" className="pt-btn pt-btn--lime w-full">
                  Shop Data Plans ↗
                </a>
              </div>
            </div>
          )}
        </header>

        <main className="flex-1">{children}</main>

        {/* Footer matching pak-tel.com */}
        <footer className="bg-[#071322] text-white border-t border-white/10">
          <div className="pt-container py-16">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
              <div className="md:col-span-5 space-y-4">
                <img
                  src="/ptlogo.png"
                  alt="Pak-Tel eSIM"
                  className="h-[62px] w-auto object-contain"
                />
                <p className="text-sm text-[#e4f1fa]/65 max-w-sm leading-relaxed">
                  Flexible digital eSIM data for Pakistan and beyond. No store queues, no tiny SIM
                  trays — pay securely in PKR and receive your QR code straight in your email.
                </p>
                <div className="inline-flex items-center gap-2 font-mono-pt text-[11px] uppercase tracking-wider text-[#c8ff43]">
                  <span className="pt-live-dot" />
                  Instant Automated Email Delivery
                </div>
              </div>

              <div className="md:col-span-3 space-y-2.5 text-sm">
                <p className="font-mono-pt text-[10px] uppercase tracking-[0.12em] text-white/45 mb-3">
                  Explore
                </p>
                <a href="/#plans" className="block text-white/75 hover:text-[#c8ff43]">
                  Data Plans
                </a>
                <Link to="/my-esim" className="block text-white/75 hover:text-[#c8ff43]">
                  ICCID Balance &amp; Top-up
                </Link>
                <a href="/#compatibility" className="block text-white/75 hover:text-[#c8ff43]">
                  Phone Compatibility
                </a>
                <a href="/#how" className="block text-white/75 hover:text-[#c8ff43]">
                  How Activation Works
                </a>
                <a href="/#faq" className="block text-white/75 hover:text-[#c8ff43]">
                  FAQ
                </a>
              </div>

              <div className="md:col-span-4 space-y-3 text-sm">
                <p className="font-mono-pt text-[10px] uppercase tracking-[0.12em] text-white/45 mb-3">
                  Checkout &amp; Support
                </p>
                <p className="text-white/70 text-xs leading-relaxed">
                  Pay in PKR via DPay (Easypaisa, JazzCash, Raast, or Bank Card). Once payment
                  succeeds, your eSIM QR code &amp; one-tap install link are sent immediately to
                  your email.
                </p>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="pt-btn pt-btn--ghost-light pt-btn--small mt-2"
                >
                  24/7 WhatsApp Support ↗
                </a>
              </div>
            </div>

            <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/45 font-mono-pt">
              <span>© {new Date().getFullYear()} Pak-Tel Digital Data eSIM. All rights reserved.</span>
              <span>Data-first connectivity • PKR Checkout</span>
            </div>
          </div>
        </footer>

        {/* Floating WhatsApp Support Button */}
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full bg-[#071322] text-white border border-[#c8ff43]/45 px-4 py-3 text-xs font-bold shadow-2xl hover:bg-[#c8ff43] hover:text-[#071322] transition-colors"
        >
          <span className="pt-live-dot" />
          Chat with us
        </a>
      </div>
    </StoreContext.Provider>
  );
}
