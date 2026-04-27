import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { MarketingHeader } from './MarketingHeader';
import { AssetPage } from '../pages/AssetPage';
import { IntelligencePage } from '../pages/IntelligencePage';
import { CapitalFlowPage } from '../pages/CapitalFlowPage';
import { ChatPage } from '../pages/ChatPage';
import { type AssetSentiment, type Prices, type Sentiments } from '../lib/marketData';
import { PATH_TO_PAGE, type PageId } from '../lib/routes';

// Shape returned by /api/intel/sentiment[/asset]. Wider than AssetSentiment —
// the extra fields are stored as state but not yet consumed by any UI.
type Sentiment = AssetSentiment & {
  confidence?: 'low' | 'medium' | 'high';
  horizon?: 'short-term' | 'medium-term' | 'long-term';
  technicalSignal?: string;
  macroContext?: string;
  keyLevels?: { support?: string | null; resistance?: string | null } | null;
  catalysts?: string[];
  risks?: string[];
};

export const AppShell: React.FC = () => {
  // ── Page routing (URL is the source of truth) ──
  const location = useLocation();
  const page: PageId = PATH_TO_PAGE[location.pathname] ?? 'landing';

  // ── Market data state ──
  const [goldPrice, setGoldPrice] = useState(2150);
  const [silverPrice, setSilverPrice] = useState(25);
  const [, setGoldChange] = useState(0);
  const [goldChangePercent, setGoldChangePercent] = useState(0);
  const [goldWeeklyChangePercent, setGoldWeeklyChangePercent] = useState(0);
  const [, setSilverChange] = useState(0);
  const [silverChangePercent, setSilverChangePercent] = useState(0);
  const [silverWeeklyChangePercent, setSilverWeeklyChangePercent] = useState(0);
  const [isWeekend, setIsWeekend] = useState(false);
  const [btcPrice, setBtcPrice] = useState(65000);
  const [, setBtcChange] = useState(0);
  const [btcChangePercent, setBtcChangePercent] = useState(0);
  const [btcWeeklyChangePercent, setBtcWeeklyChangePercent] = useState(0);
  const [btcMarketCap, setBtcMarketCap] = useState(1280000000000);
  const [btcDominance, setBtcDominance] = useState(52.5);
  const [btcVolume24h, setBtcVolume24h] = useState('$35.2B');
  const [btcVolumeChangePercent, setBtcVolumeChangePercent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [marketSentiment, setMarketSentiment] = useState<Sentiment | null>(null);
  const [goldSentiment, setGoldSentiment] = useState<Sentiment | null>(null);
  const [silverSentiment, setSilverSentiment] = useState<Sentiment | null>(null);

  // Throttle per-asset hover fetches so repeated hovers within a window reuse
  // the last in-flight or fresh result. Backend is Postgres-cached too, but
  // this avoids even issuing the HTTP call during rapid hover storms.
  const hoverFetchTimes = useRef<Record<'gold' | 'silver' | 'bitcoin', number>>({
    gold: 0,
    silver: 0,
    bitcoin: 0,
  });
  const HOVER_THROTTLE_MS = 10 * 60 * 1000;

  // localStorage cache — used only for the initial aggregate hydrate. TTL
  // matches the backend cache so panels reflect current market across reloads.
  const STORAGE_KEY = 'market_sentiment_cache';
  const CACHE_DURATION_MS = 10 * 60 * 1000;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const applyAggregate = (data: {
    crypto?: Sentiment | null;
    gold?: Sentiment | null;
    silver?: Sentiment | null;
  }) => {
    if (data.crypto) setMarketSentiment(data.crypto);
    if (data.gold) setGoldSentiment(data.gold);
    if (data.silver) setSilverSentiment(data.silver);
  };

  const hydrateSentiments = async () => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION_MS) {
          applyAggregate(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to read sentiment cache', e);
    }

    try {
      const response = await fetch('/api/intel/sentiment');
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const data = await response.json();
      applyAggregate(data);

      if (data?.crypto || data?.gold || data?.silver) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ timestamp: Date.now(), data }),
        );
      }
    } catch (error) {
      console.error('Error fetching aggregate sentiment:', error);
    }
  };

  // Per-asset fetch triggered by bullion hover. Maps the UI key
  // ('gold' | 'silver' | 'bitcoin') to the backend's asset slug.
  const fetchSentimentFor = async (asset: 'gold' | 'silver' | 'bitcoin') => {
    const now = Date.now();
    if (now - hoverFetchTimes.current[asset] < HOVER_THROTTLE_MS) return;
    hoverFetchTimes.current[asset] = now;

    const slug = asset === 'bitcoin' ? 'crypto' : asset;
    try {
      const response = await fetch(`/api/intel/sentiment/${slug}`);
      if (!response.ok) return;
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const data: Sentiment = await response.json();
      if (asset === 'gold') setGoldSentiment(data);
      else if (asset === 'silver') setSilverSentiment(data);
      else setMarketSentiment(data);
    } catch (error) {
      console.warn(`Hover sentiment fetch failed (${asset}):`, error);
    }
  };

  // Wrapped in a sync handler that AssetPage's bullion children can call
  // without awaiting.
  const handleFetchSentimentFor = (asset: 'gold' | 'silver' | 'bitcoin') => {
    void fetchSentimentFor(asset);
  };

  // ── Fetch market sentiment via backend ──
  useEffect(() => {
    void hydrateSentiments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch real-time prices from backend ──
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) return;
        const data = await response.json();
        if (data && data.gold && data.silver) {
          setGoldPrice(data.gold);
          setSilverPrice(data.silver);
          if (data.btc) setBtcPrice(data.btc);
          if (data.btcMarketCap) setBtcMarketCap(data.btcMarketCap);
          if (data.btcDominance) setBtcDominance(data.btcDominance);
          if (data.btcVolume24h) {
            const vol = data.btcVolume24h;
            if (vol >= 1e9) setBtcVolume24h(`$${(vol / 1e9).toFixed(2)}B`);
            else if (vol >= 1e6) setBtcVolume24h(`$${(vol / 1e6).toFixed(2)}M`);
            else setBtcVolume24h(`$${vol.toLocaleString()}`);
          }
          if (data.btcVolumeChangePercent !== undefined) setBtcVolumeChangePercent(data.btcVolumeChangePercent);
          if (data.goldChange !== undefined) setGoldChange(data.goldChange);
          if (data.goldChangePercent !== undefined) setGoldChangePercent(data.goldChangePercent);
          if (data.goldWeeklyChangePercent !== undefined) setGoldWeeklyChangePercent(data.goldWeeklyChangePercent);
          if (data.silverChange !== undefined) setSilverChange(data.silverChange);
          if (data.silverChangePercent !== undefined) setSilverChangePercent(data.silverChangePercent);
          if (data.silverWeeklyChangePercent !== undefined) setSilverWeeklyChangePercent(data.silverWeeklyChangePercent);
          if (data.btcChange !== undefined) setBtcChange(data.btcChange);
          if (data.btcChangePercent !== undefined) setBtcChangePercent(data.btcChangePercent);
          if (data.btcWeeklyChangePercent !== undefined) setBtcWeeklyChangePercent(data.btcWeeklyChangePercent);
          if (data.isWeekend !== undefined) setIsWeekend(data.isWeekend);
        }
      } catch (error) {
        console.warn('Temporary network error fetching market prices.');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Derived ──
  const ratio = goldPrice / (silverPrice || 0.1);

  // ── Shared prices object for header / pages ──
  const prices: Prices | null =
    goldPrice && silverPrice && btcPrice
      ? {
          gold: {
            price: goldPrice,
            changePercent24h: goldChangePercent,
            weeklyChangePercent: goldWeeklyChangePercent,
          },
          silver: {
            price: silverPrice,
            changePercent24h: silverChangePercent,
            weeklyChangePercent: silverWeeklyChangePercent,
          },
          bitcoin: {
            price: btcPrice,
            changePercent24h: btcChangePercent,
            weeklyChangePercent: btcWeeklyChangePercent,
            marketCap: btcMarketCap,
            dominance: btcDominance,
          },
          goldSilverRatio: ratio,
          isWeekend,
        }
      : null;

  // Visual height of the floating MarketingHeader in app variant: 14px*2
  // padding + ~38px tallest child (the pill) ≈ 66px. Buffer to 76 so non-
  // canvas pages clear it cleanly.
  const HEADER_CLEARANCE = 76;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        background: '#06060e',
        overflow: 'hidden',
      }}
    >
      <MarketingHeader prices={prices} loading={isLoading} variant="app" />

      <main style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {/* Asset (3D bullion scene) — full-bleed so the WebGL canvas paints
            behind the glass header. Scene stays mounted to preserve the
            WebGL context across route changes. */}
        <div
          style={{
            display: page === 'landing' ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        >
          <AssetPage
            isLoading={isLoading}
            isWeekend={isWeekend}
            prices={prices}
            goldPrice={goldPrice}
            silverPrice={silverPrice}
            btcPrice={btcPrice}
            goldChangePercent={goldChangePercent}
            goldWeeklyChangePercent={goldWeeklyChangePercent}
            silverChangePercent={silverChangePercent}
            silverWeeklyChangePercent={silverWeeklyChangePercent}
            btcChangePercent={btcChangePercent}
            btcWeeklyChangePercent={btcWeeklyChangePercent}
            btcMarketCap={btcMarketCap}
            btcDominance={btcDominance}
            btcVolume24h={btcVolume24h}
            btcVolumeChangePercent={btcVolumeChangePercent}
            goldSentiment={goldSentiment}
            silverSentiment={silverSentiment}
            bitcoinSentiment={marketSentiment}
            fetchSentimentFor={handleFetchSentimentFor}
          />
        </div>

        {/* Intelligence — wrapper starts below the floating header so its
            scrollable content doesn't tuck under the glass nav. */}
        <div
          style={{
            display: page === 'intelligence' ? 'block' : 'none',
            position: 'absolute',
            top: HEADER_CLEARANCE,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <IntelligencePage prices={prices} />
        </div>

        {/* Capital Flow */}
        <div
          style={{
            display: page === 'flow' ? 'block' : 'none',
            position: 'absolute',
            top: HEADER_CLEARANCE,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <CapitalFlowPage prices={prices} />
        </div>

        {/* Smart Assets / Chat */}
        <div
          style={{
            display: page === 'chat' ? 'block' : 'none',
            position: 'absolute',
            top: HEADER_CLEARANCE,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <ChatPage
            prices={prices}
            sentiments={
              {
                gold: goldSentiment,
                silver: silverSentiment,
                bitcoin: marketSentiment,
              } satisfies Sentiments
            }
          />
        </div>
      </main>
    </div>
  );
};
