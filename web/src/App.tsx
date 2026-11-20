import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { apiFetch, StoreConfig } from './lib/api';
import { AuthProvider } from './lib/auth';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { DpayCheckoutPage } from './pages/DpayCheckoutPage';
import { MyEsimPortalPage } from './pages/MyEsimPortalPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { StorefrontPage } from './pages/StorefrontPage';

export function App() {
  const [config, setConfig] = useState<StoreConfig | null>(null);

  const loadConfig = useCallback(() => {
    apiFetch<StoreConfig>('/api/store-config')
      .then((c) => setConfig(c))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout config={config}>
          <Routes>
            <Route path="/" element={<StorefrontPage config={config} />} />
            <Route path="/my-esim" element={<MyEsimPortalPage />} />
            <Route path="/order/:orderId" element={<OrderDetailPage />} />
            <Route path="/checkout/dpay/:sessionId" element={<DpayCheckoutPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route
              path="/admin"
              element={<AdminPage onSettingsChanged={loadConfig} />}
            />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
