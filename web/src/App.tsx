import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { DpayCheckoutPage } from './pages/DpayCheckoutPage';
import { MyEsimPortalPage } from './pages/MyEsimPortalPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { StorefrontPage } from './pages/StorefrontPage';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<StorefrontPage />} />
          <Route path="/my-esim" element={<MyEsimPortalPage />} />
          <Route path="/order/:orderId" element={<OrderDetailPage />} />
          <Route path="/checkout/dpay/:sessionId" element={<DpayCheckoutPage />} />
          <Route path="/*" element={<AdminPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
