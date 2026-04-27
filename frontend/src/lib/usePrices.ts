import { useEffect, useState } from 'react';
import type { Prices } from './marketData';

// Lightweight prices hook used by surfaces that only need the header tickers
// (e.g. the marketing landing). The in-app shell still manages its own
// expanded price state because it derives many extra fields from /api/prices
// (BTC market cap, dominance, volume, weekly %, etc.).
export function usePrices(): { prices: Prices | null; loading: boolean } {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        const ct = response.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) return;
        const data = await response.json();
        if (cancelled) return;
        if (data && data.gold && data.silver && data.btc) {
          setPrices({
            gold: {
              price: data.gold,
              changePercent24h: data.goldChangePercent ?? 0,
              weeklyChangePercent: data.goldWeeklyChangePercent ?? 0,
            },
            silver: {
              price: data.silver,
              changePercent24h: data.silverChangePercent ?? 0,
              weeklyChangePercent: data.silverWeeklyChangePercent ?? 0,
            },
            bitcoin: {
              price: data.btc,
              changePercent24h: data.btcChangePercent ?? 0,
              weeklyChangePercent: data.btcWeeklyChangePercent ?? 0,
              marketCap: data.btcMarketCap,
              dominance: data.btcDominance,
            },
            goldSilverRatio: data.gold / Math.max(data.silver, 0.01),
            isWeekend: data.isWeekend,
          });
        }
      } catch {
        // Network errors are expected when the backend is briefly unreachable;
        // the UI gracefully renders without tickers.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { prices, loading };
}
