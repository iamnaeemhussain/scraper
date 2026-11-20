import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { formatMbToReadable, formatPkr } from './lib/api';
import { AuthProvider } from './lib/auth';
import { StorefrontPage } from './pages/StorefrontPage';

describe('Pak-Tel Web Storefront & Formatting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('formats PKR whole rupees and MB/GB usage cleanly', () => {
    expect(formatPkr(2499)).toBe('Rs. 2,499');
    expect(formatPkr(7099)).toBe('Rs. 7,099');
    expect(formatMbToReadable(512)).toBe('512 MB');
    expect(formatMbToReadable(15360)).toBe('15.00 GB');
  });

  it('renders Storefront bundles, strikethrough discount badges, and device checker', async () => {
    const mockBundles = [
      {
        id: 'b-15gb',
        name: '15 GB 30 Days',
        slug: '15-gb-30-days',
        pricePkr: 2499,
        actualPricePkr: 4999,
        discountPct: 50,
        priceDifferencePkr: 2500,
        currency: 'PKR',
        dataLabel: '15 GB',
        dataGb: 15,
        isUnlimited: false,
        validityDays: 30,
        isReloadable: true,
        isMostPopular: true,
        countryCode: 'PK',
        countryName: 'Pakistan',
        coverageType: '5G/4G/LTE',
        planType: 'Data only',
        hotspotAllowed: true,
        activationType: 'Instant',
        operators: 'Jazz (Mobilink) Pakistan',
        yesimPlanId: 'e299479f253a1a82968fd070df904313',
        contact: '3259717066',
        message: null,
        sortOrder: 1,
      },
    ];

    const mockDevices = [
      {
        type: 'PHONE',
        brands: [
          {
            brand: 'Apple',
            models: [{ model: 'iPhone 16 Pro Max' }],
          },
        ],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/bundles')) {
        return new Response(JSON.stringify(mockBundles), { status: 200 });
      }
      if (url.includes('/api/compatibility/devices')) {
        return new Response(JSON.stringify(mockDevices), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <StorefrontPage config={null} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('15 GB 30 Days')).toBeInTheDocument();
    });

    expect(screen.getByText('50% OFF')).toBeInTheDocument();
    expect(screen.getByText('Most Popular')).toBeInTheDocument();
    expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument();
  });
});
