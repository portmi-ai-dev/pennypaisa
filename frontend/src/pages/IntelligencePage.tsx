import * as React from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ASSET_CONFIG, openChartTab, type AssetKey, type Prices } from '../lib/marketData';

// Submenu uses ``btc`` as the slug; the page's internal key is ``bitcoin``.
const QUERY_TO_ASSET: Record<string, AssetKey> = {
  gold: 'gold',
  silver: 'silver',
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
};

function assetFromSearch(search: string): AssetKey {
  const param = new URLSearchParams(search).get('asset')?.toLowerCase();
  return (param && QUERY_TO_ASSET[param]) || 'gold';
}

interface Condition {
  text: string;
  /** `true` when this driver is meaningfully in play right now. Highlighted in the UI. */
  active?: boolean;
  /** Optional one-liner shown on hover explaining *why* it's currently active. */
  why?: string;
}

interface ConditionConfig {
  bull: Condition[];
  bear: Condition[];
}

// "active" flags reflect macro conditions verifiably in play as of Q2 2026.
// Edit these when the regime shifts — they drive the LIVE highlight in the UI.
const COND: Record<AssetKey, ConditionConfig> = {
  gold: {
    bull: [
      { text: 'Cyclic ATH pattern (~15yr cycles)', active: true, why: 'Gold breaking new all-time highs through 2025-26.' },
      { text: 'War & geopolitical fear', active: true, why: 'Active conflicts and elevated geopolitical risk premium.' },
      { text: 'Inflation hedge \u00b7 De-dollarization', active: true, why: 'BRICS+ reserve diversification accelerating.' },
      { text: 'Central bank accumulation', active: true, why: 'Record central-bank buying for the 4th consecutive year.' },
      { text: 'Weak US Dollar demand' },
    ],
    bear: [
      { text: 'Prolonged consolidation periods' },
      { text: 'Strong US Dollar' },
      { text: 'Risk-on capital rotation' },
      { text: 'Rising interest rates' },
      { text: 'Cooling inflation narrative', active: true, why: 'Headline CPI moderating from 2022 highs.' },
    ],
  },
  silver: {
    bull: [
      { text: 'Structural supply deficit deepening', active: true, why: 'Silver Institute reports 5th consecutive deficit year.' },
      { text: 'AI & data center demand', active: true, why: 'Hyperscaler buildouts driving conductive-silver demand.' },
      { text: 'Solar + EV battery absorption', active: true, why: 'Global solar installs continuing record pace.' },
      { text: 'Follows gold bull cycles', active: true, why: 'Gold at ATH typically pulls silver higher with lag.' },
      { text: 'Dual store-of-value identity' },
    ],
    bear: [
      { text: 'Massive profit-taking after parabolic rises' },
      { text: 'Narrative exaggeration near tops' },
      { text: 'Gold consolidation drags silver' },
      { text: 'High volatility downside risk', active: true, why: 'Silver beta to gold remains elevated.' },
      { text: 'Industrial slowdown scenarios' },
    ],
  },
  bitcoin: {
    bull: [
      { text: '4-year halving cycle bull phase', active: true, why: 'Post-2024-halving cycle still in expansion phase.' },
      { text: 'Fed rate cuts & M2 expansion' },
      { text: 'Institutional & ETF adoption', active: true, why: 'Spot BTC ETFs continue record AUM growth.' },
      { text: 'Government treasury accumulation', active: true, why: 'US Strategic Bitcoin Reserve and sovereign buyers active.' },
      { text: 'Falling DXY tailwind' },
    ],
    bear: [
      { text: '70%+ post-cycle drawdowns', why: 'Risk increases as cycle matures.' },
      { text: 'FUD & macro shock risk', active: true, why: 'Elevated macro volatility persists.' },
      { text: 'Fed hawkish pivot scenario' },
      { text: 'Government crackdown / ban risk' },
      { text: 'Quantum computing narrative' },
    ],
  },
};

interface Props {
  prices: Prices | null;
}

export const IntelligencePage: React.FC<Props> = ({ prices }) => {
  const location = useLocation();
  const [activeAsset, setActiveAsset] = useState<AssetKey>(() =>
    assetFromSearch(location.search),
  );

  // Re-sync when the dropdown switches the URL while we're already mounted
  // (the page is kept alive via display:none, so navigation between
  // ?asset=gold and ?asset=silver doesn't remount).
  useEffect(() => {
    setActiveAsset(assetFromSearch(location.search));
  }, [location.search]);

  const cfg = ASSET_CONFIG[activeAsset];
  const cond = COND[activeAsset];
  const price = prices?.[activeAsset];
  const change = price?.changePercent24h ?? 0;
  const isBull = change >= 0;

  const fmtPrice = () => {
    if (!price) return '\u2014';
    return activeAsset === 'bitcoin'
      ? `$${price.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${price.price.toFixed(2)}`;
  };

  const activeBull = cond.bull.filter((c) => c.active).length;
  const activeBear = cond.bear.filter((c) => c.active).length;

  return (
    <div style={IS.page}>
      {/* Ambient glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `radial-gradient(ellipse 60% 70% at 50% 30%, ${cfg.colorDim.replace('0.08', '0.05')} 0%, transparent 70%)`,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* ── ASSET SELECTOR ── */}
        <div style={IS.tabs}>
          {(Object.keys(ASSET_CONFIG) as AssetKey[]).map((key) => {
            const c = ASSET_CONFIG[key];
            const active = activeAsset === key;
            const p = prices?.[key];
            const ch = p?.changePercent24h ?? 0;
            return (
              <button
                key={key}
                onClick={() => setActiveAsset(key)}
                style={{
                  ...IS.tab,
                  background: active ? c.colorDim : 'transparent',
                  borderBottom: active ? `2px solid ${c.color}` : '2px solid transparent',
                  color: active ? c.color : 'rgba(255,255,255,0.3)',
                }}
              >
                <div style={{ fontFamily: 'DM Sans', fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
                  {c.sym}
                </div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, fontWeight: 300 }}>
                  {p
                    ? key === 'bitcoin'
                      ? `$${p.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : `$${p.price.toFixed(2)}`
                    : '\u2014'}
                </div>
                <div
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 10,
                    color: ch >= 0 ? '#4caf50' : '#ef5350',
                    marginTop: 2,
                  }}
                >
                  {ch >= 0 ? '+' : ''}
                  {ch.toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>

        {/* ── MAIN CONTENT — single column, centered ── */}
        <div style={IS.body}>
          <div style={IS.column}>
            {/* HEADER: name · tagline */}
            <div
              style={{
                fontFamily: 'DM Sans',
                fontSize: 10,
                letterSpacing: 3.5,
                color: cfg.color,
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {cfg.name} · {cfg.tagline}
            </div>

            {/* PRICE — large, clickable to chart */}
            <button
              onClick={() => openChartTab(activeAsset)}
              title={`Open ${cfg.sym} candlestick chart in a new tab`}
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 76,
                fontWeight: 300,
                color: '#ece4d4',
                lineHeight: 1,
                letterSpacing: -1.5,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 14,
                transition: 'color 0.15s, text-shadow 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = cfg.color;
                e.currentTarget.style.textShadow = `0 0 28px ${cfg.color}55`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#ece4d4';
                e.currentTarget.style.textShadow = 'none';
              }}
            >
              {fmtPrice()}
              <span
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 11,
                  fontStyle: 'normal',
                  letterSpacing: 2,
                  color: 'rgba(255,255,255,0.32)',
                  textTransform: 'uppercase',
                  marginLeft: 4,
                }}
              >
                ↗ Chart
              </span>
            </button>

            {/* 24h change + Bull/Bear regime */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <span
                style={{
                  fontFamily: 'DM Sans',
                  fontSize: 17,
                  color: isBull ? '#4caf50' : '#ef5350',
                  fontWeight: 600,
                }}
              >
                {isBull ? '\u25b2' : '\u25bc'} {Math.abs(change).toFixed(2)}%
              </span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
                24h
              </span>
              <span
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 22,
                  fontStyle: 'italic',
                  color: isBull ? '#4caf50' : '#ef5350',
                  marginLeft: 8,
                  opacity: 0.9,
                }}
              >
                {isBull ? 'Bull' : 'Bear'}
              </span>
              {activeAsset === 'bitcoin' && price?.dominance && (
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
                  Dominance <span style={{ color: '#f7931a' }}>{price.dominance.toFixed(1)}%</span>
                </span>
              )}
            </div>

            {/* (Au:Ag ratio pill removed per design — ratio is still surfaced
                on the landing page header.) */}

            {/* MARKET CONDITIONS — full width */}
            <div style={{ marginTop: 38 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: 18,
                  paddingBottom: 12,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 10,
                      letterSpacing: 3.5,
                      color: 'rgba(255,255,255,0.35)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Market Conditions
                  </div>
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.4)',
                      marginTop: 4,
                    }}
                  >
                    {activeBull + activeBear} drivers playing out · {cond.bull.length + cond.bear.length} total
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontFamily: 'DM Sans',
                    fontSize: 9.5,
                    letterSpacing: 1.6,
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#f5d78e',
                      boxShadow: '0 0 8px #f5d78eaa',
                      animation: 'gilverCondPulse 1.4s infinite',
                    }}
                  />
                  Live now
                </div>
              </div>

              {/* Bull conditions */}
              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#4caf50',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    Bullish drivers
                  </span>
                  <span
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 9.5,
                      color: 'rgba(76,175,80,0.5)',
                    }}
                  >
                    {activeBull}/{cond.bull.length} active
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {cond.bull.map((b, i) => (
                    <span
                      key={i}
                      title={b.active ? b.why ?? 'Currently playing out' : b.text}
                      style={{
                        position: 'relative',
                        fontFamily: 'DM Sans',
                        fontSize: b.active ? 12 : 11,
                        fontWeight: b.active ? 600 : 400,
                        color: b.active ? '#7dd689' : 'rgba(76,175,80,0.5)',
                        background: b.active ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.04)',
                        border: b.active
                          ? '1px solid rgba(76,175,80,0.55)'
                          : '1px solid rgba(76,175,80,0.1)',
                        boxShadow: b.active ? '0 0 12px rgba(76,175,80,0.25)' : 'none',
                        borderRadius: 22,
                        padding: b.active ? '7px 14px 7px 26px' : '5px 13px',
                        transition: 'all 0.2s',
                      }}
                    >
                      {b.active && (
                        <span
                          style={{
                            position: 'absolute',
                            left: 11,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: '#4caf50',
                            boxShadow: '0 0 7px #4caf50',
                            animation: 'gilverCondPulse 1.4s infinite',
                          }}
                        />
                      )}
                      + {b.text}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bear conditions */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 10,
                      letterSpacing: 2,
                      color: '#ef5350',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    Bearish drivers
                  </span>
                  <span
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 9.5,
                      color: 'rgba(239,83,80,0.5)',
                    }}
                  >
                    {activeBear}/{cond.bear.length} active
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {cond.bear.map((b, i) => (
                    <span
                      key={i}
                      title={b.active ? b.why ?? 'Currently playing out' : b.text}
                      style={{
                        position: 'relative',
                        fontFamily: 'DM Sans',
                        fontSize: b.active ? 12 : 11,
                        fontWeight: b.active ? 600 : 400,
                        color: b.active ? '#ff8a86' : 'rgba(239,83,80,0.5)',
                        background: b.active ? 'rgba(239,83,80,0.15)' : 'rgba(239,83,80,0.04)',
                        border: b.active
                          ? '1px solid rgba(239,83,80,0.55)'
                          : '1px solid rgba(239,83,80,0.1)',
                        boxShadow: b.active ? '0 0 12px rgba(239,83,80,0.22)' : 'none',
                        borderRadius: 22,
                        padding: b.active ? '7px 14px 7px 26px' : '5px 13px',
                        transition: 'all 0.2s',
                      }}
                    >
                      {b.active && (
                        <span
                          style={{
                            position: 'absolute',
                            left: 11,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: '#ef5350',
                            boxShadow: '0 0 7px #ef5350',
                            animation: 'gilverCondPulse 1.4s infinite',
                          }}
                        />
                      )}
                      − {b.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gilverCondPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>
    </div>
  );
};

const IS: Record<string, React.CSSProperties> = {
  page: { width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#06060e' },
  tabs: { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  tab: { flex: 1, padding: '20px 26px', border: 'none', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' },
  body: { flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' },
  column: { width: '100%', maxWidth: 880, padding: '44px 36px 56px' },
};
