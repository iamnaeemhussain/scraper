import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('Pak-Tel Storefront & Secret Admin Gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/store-config')) {
        return new Response(
          JSON.stringify({
            storeName: 'Pak-Tel eSIM',
            currency: 'PKR',
            paymentProvider: 'DPAY',
            supportWhatsapp: '923259717066',
            storeNotice: 'Pak-Tel updates ticker',
            compatibilityBrands: 10,
          }),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/bundles')) {
        return new Response(
          JSON.stringify([
            {
              id: 'b1',
              yesimPackageCode: 'PK_15GB_30D',
              name: '15 GB 30 Days',
              countryCode: 'PK',
              countryName: 'Pakistan',
              region: 'South Asia',
              dataMb: 15360,
              dataDisplay: '15 GB',
              validityDays: 30,
              coverage: '5G/4G/LTE',
              planType: 'Data only',
              hotspotSupported: true,
              activationType: 'Instant',
              reloadable: true,
              unlimited: false,
              pricePkr: 2499,
              originalPricePkr: 4999,
              costUsdCents: 690,
              badge: 'Most popular',
              sortOrder: 1,
              enabled: true,
            },
          ]),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/admin/gate')) {
        const hdr = (init?.headers as Record<string, string> | undefined)?.['X-Admin-Secret-Path'];
        if (hdr === 'private-ops-test') {
          return new Response(
            JSON.stringify({ authorizedRoute: true, credentialsConfigured: true }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;
  });

  it('renders Pak-Tel hero, logo, PKR plans, and zero user account signup links', async () => {
    render(<App />);
    expect(await screen.findByText(/Your data\./i)).toBeDefined();
    expect(await screen.findByText(/PKR 2,499/i)).toBeDefined();
    expect(screen.queryByText(/Register/i)).toBeNull();
    expect(screen.queryByText(/Create account/i)).toBeNull();
  });

  it('returns 404 on /admin when secret path does not match runtime secret', async () => {
    window.history.pushState({}, '', '/admin');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Page not found/i)).toBeDefined();
    });
  });

  it('unlocks Admin Login only on verified runtime secret route', async () => {
    window.history.pushState({}, '', '/private-ops-test');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Pak-Tel Operations/i)).toBeDefined();
    });
  });
});
