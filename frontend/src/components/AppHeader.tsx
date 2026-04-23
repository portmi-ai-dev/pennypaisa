import * as React from 'react';
import { openChartTab, type AssetKey, type Prices } from '../lib/marketData';

export type PageId = 'landing' | 'intelligence' | 'chat';

export interface NavItem {
  id: PageId;
  label: string;
  accent: string;
  icon: React.ReactNode;
}

const IconAssets = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="2" y="9" width="8" height="5" rx="1" />
    <rect x="14" y="9" width="8" height="5" rx="1" />
    <line x1="10" y1="11.5" x2="14" y2="11.5" />
    <rect x="9.5" y="14" width="5" height="4" rx="0.5" />
  </svg>
);
const IconIntel = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconChat = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const NAV_ITEMS: NavItem[] = [
  { id: 'landing', label: 'Assets', accent: '#d4a843', icon: IconAssets },
  { id: 'intelligence', label: 'Intelligence', accent: '#4a8fe8', icon: IconIntel },
  { id: 'chat', label: 'Smart Assets', accent: '#9b72cf', icon: IconChat },
];

interface Props {
  page: PageId;
  setPage: (p: PageId) => void;
  prices: Prices | null;
  loading: boolean;
}

export const AppHeader: React.FC<Props> = ({ page, setPage, prices, loading }) => {
  const tickers: Array<{ sym: string; v: string; c: number; col: string; asset: AssetKey }> | null =
    prices && [
      {
        sym: 'XAU',
        v: `$${prices.gold.price.toFixed(0)}`,
        c: prices.gold.changePercent24h,
        col: '#d4a843',
        asset: 'gold',
      },
      {
        sym: 'XAG',
        v: `$${prices.silver.price.toFixed(2)}`,
        c: prices.silver.changePercent24h,
        col: '#b8c4cc',
        asset: 'silver',
      },
      {
        sym: 'BTC',
        v: `$${prices.bitcoin.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        c: prices.bitcoin.changePercent24h,
        col: '#f7931a',
        asset: 'bitcoin',
      },
    ];

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 54,
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(4,4,10,0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        flexShrink: 0,
        zIndex: 1000,
        gap: 0,
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 32 }}>
        <div style={{ width: 26, height: 26, position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 16, height: 16, background: '#d4a843', borderRadius: 2, position: 'absolute', top: 0, left: 0 }} />
          <div style={{ width: 16, height: 16, background: '#b8c4cc', borderRadius: 2, position: 'absolute', bottom: 0, right: 0, opacity: 0.88 }} />
        </div>
        <span
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 21,
            fontWeight: 400,
            color: '#e8e0d0',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
          }}
        >
          gilver<span style={{ color: '#d4a843' }}>.</span>ai
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', gap: 2 }}>
        {NAV_ITEMS.map(({ id, label, icon, accent }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 14px',
                background: active ? 'rgba(255,255,255,0.045)' : 'transparent',
                border: 'none',
                borderRadius: 4,
                color: active ? '#e8e0d0' : 'rgba(255,255,255,0.32)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              <span style={{ color: active ? accent : 'rgba(255,255,255,0.25)', display: 'inline-flex', transition: 'color 0.15s' }}>
                {icon}
              </span>
              {label}
              {active && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 14,
                    right: 14,
                    height: 1,
                    background: accent,
                    borderRadius: 1,
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right side: tickers + status */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
        {tickers && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {tickers.map((t) => (
              <button
                key={t.sym}
                onClick={() => openChartTab(t.asset)}
                title={`Open ${t.sym} candlestick chart in a new tab`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 6px',
                  margin: '0 -6px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontFamily: 'DM Sans', fontSize: 9, letterSpacing: 2, color: t.col }}>{t.sym}</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#d8d0c0' }}>{t.v}</span>
                <span
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 10,
                    color: t.c > 0 ? '#4caf50' : t.c < 0 ? '#ef5350' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {t.c > 0 ? '+' : ''}
                  {t.c.toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: loading ? '#f5d78e' : '#4caf50',
              boxShadow: loading ? '0 0 5px #f5d78e88' : '0 0 5px #4caf5088',
              animation: loading ? 'gilverHdrPulse 1s infinite' : 'none',
            }}
          />
          <span
            style={{
              fontFamily: 'DM Sans',
              fontSize: 9,
              letterSpacing: 1.5,
              color: 'rgba(255,255,255,0.18)',
              textTransform: 'uppercase',
            }}
          >
            {loading ? 'Syncing' : 'Live'}
          </span>
        </div>
      </div>

      <style>{`@keyframes gilverHdrPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>
    </header>
  );
};
