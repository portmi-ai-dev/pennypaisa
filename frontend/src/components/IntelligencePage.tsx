import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ASSET_CONFIG, openChartTab, type AssetKey, type Prices } from '../lib/marketData';

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
  sectors: { l: string; pct: number }[];
  prompt: (p: any, ratio?: number) => string;
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
    sectors: [
      { l: 'Investment (ETFs, Bars, Coins)', pct: 45 },
      { l: 'Jewelry & Luxury', pct: 37 },
      { l: 'Central Banks', pct: 11 },
      { l: 'Industrial & Tech', pct: 7 },
    ],
    prompt: (p) =>
      `You are a senior precious metals analyst. Gold spot = $${p?.price?.toFixed(2)}/oz, 24h change = ${p?.changePercent24h?.toFixed(
        2,
      )}%. Write a sharp market intelligence brief in 3 flowing paragraphs (no headers, no bullets): current trend & trajectory, key macro drivers today, near-term outlook with one contrarian view. Plain English. Under 150 words total.`,
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
    sectors: [
      { l: 'Industrial & Technology', pct: 52 },
      { l: 'Investment (ETFs, Bars)', pct: 24 },
      { l: 'Jewelry & Silverware', pct: 16 },
      { l: 'Other', pct: 8 },
    ],
    prompt: (p) =>
      `You are a senior commodities analyst. Silver spot = $${p?.price?.toFixed(2)}/oz, 24h = ${p?.changePercent24h?.toFixed(
        2,
      )}%. Write a sharp intelligence brief in 3 flowing paragraphs: industrial demand drivers (AI, solar, EVs), supply deficit dynamics, price trajectory. Plain English. Under 150 words total.`,
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
    sectors: [
      { l: 'Institutional Holdings', pct: 38 },
      { l: 'Retail HODLers', pct: 32 },
      { l: 'Exchange Reserves', pct: 18 },
      { l: 'Government & ETFs', pct: 12 },
    ],
    prompt: (p) =>
      `You are a senior crypto analyst. BTC = $${p?.price?.toLocaleString()}, 24h = ${p?.changePercent24h?.toFixed(
        2,
      )}%, dominance = ${p?.dominance?.toFixed(
        1,
      )}%. Write a sharp intelligence brief in 3 flowing paragraphs: halving cycle position, macro conditions, institutional adoption momentum. Plain English. Under 150 words total.`,
  },
};

interface Props {
  prices: Prices | null;
}

export const IntelligencePage: React.FC<Props> = ({ prices }) => {
  const [activeAsset, setActiveAsset] = useState<AssetKey>('gold');
  const [analysis, setAnalysis] = useState<Partial<Record<AssetKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<Partial<Record<AssetKey, string>>>({});
  const lastPricesRef = useRef<Prices | null>(null);

  // Reset cached briefs when prices update meaningfully
  useEffect(() => {
    if (prices && lastPricesRef.current !== prices) {
      lastPricesRef.current = prices;
      fetchedRef.current = {};
      setAnalysis({});
    }
  }, [prices]);

  const cfg = ASSET_CONFIG[activeAsset];
  const cond = COND[activeAsset];
  const price = prices?.[activeAsset];
  const change = price?.changePercent24h ?? 0;
  const isBull = change >= 0;

  const fetchAnalysis = React.useCallback(async () => {
    if (!prices || fetchedRef.current[activeAsset]) return;
    setLoading(true);
    // Read as text first so non-JSON error pages (e.g. a 404 HTML when the
    // dev proxy isn't routing /chat) surface in console instead of a silent
    // JSON.parse throw landing in the catch block.
    let errorMsg: string | null = null;
    let text: string | null = null;
    try {
      const res = await fetch('/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: cond.prompt(price) }),
      });
      const raw = await res.text();
      if (!res.ok) {
        console.error('[intel] HTTP', res.status, raw.slice(0, 300));
        // 429 = Gemini daily/per-minute quota exhausted. Surface a specific,
        // actionable message instead of a cryptic status code.
        if (res.status === 429) {
          let retrySec: number | null = Number(res.headers.get('Retry-After')) || null;
          try {
            const parsed = JSON.parse(raw);
            const ra = parsed?.detail?.retryAfter;
            if (typeof ra === 'number') retrySec = ra;
          } catch {
            /* ignore — fall back to header */
          }
          const hint = retrySec ? ` Try again in ~${retrySec}s.` : '';
          errorMsg =
            `Gemini API quota exhausted (free tier = 20 requests/day on gemini-2.5-flash).` +
            `${hint} Switch tabs to retry, or upgrade your Gemini plan.`;
        } else {
          errorMsg = `Intelligence feed unavailable (HTTP ${res.status}). Switch tabs to retry.`;
        }
      } else {
        try {
          const data = JSON.parse(raw);
          const answer =
            typeof data === 'object' && data && 'answer' in data ? (data.answer as string) : '';
          if (answer && answer.trim()) {
            text = answer;
          } else {
            console.error('[intel] missing answer field; body=', raw.slice(0, 300));
            errorMsg = 'Intelligence feed unavailable (empty response). Switch tabs to retry.';
          }
        } catch (parseErr) {
          console.error('[intel] non-JSON response:', raw.slice(0, 300), parseErr);
          errorMsg = 'Intelligence feed unavailable (bad response). Switch tabs to retry.';
        }
      }
    } catch (err) {
      console.error('[intel] network error:', err);
      errorMsg = 'Intelligence feed unavailable (network). Switch tabs to retry.';
    }
    if (text) {
      // Only cache real briefs — never cache the error fallback, otherwise
      // tab-switching can't recover from a transient backend hiccup.
      fetchedRef.current[activeAsset] = text;
      setAnalysis((prev) => ({ ...prev, [activeAsset]: text! }));
    } else {
      setAnalysis((prev) => ({ ...prev, [activeAsset]: errorMsg ?? 'Intelligence feed unavailable.' }));
    }
    setLoading(false);
  }, [activeAsset, prices, price, cond]);

  useEffect(() => {
    if (prices && !fetchedRef.current[activeAsset]) fetchAnalysis();
  }, [activeAsset, prices, fetchAnalysis]);

  const fmtPrice = () => {
    if (!price) return '\u2014';
    return activeAsset === 'bitcoin'
      ? `$${price.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${price.price.toFixed(2)}`;
  };

  return (
    <div style={IS.page}>
      {/* Ambient glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `radial-gradient(ellipse 50% 60% at 75% 40%, ${cfg.colorDim.replace('0.08', '0.06')} 0%, transparent 70%)`,
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
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, fontWeight: 300 }}>
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

        {/* ── MAIN CONTENT ── */}
        <div style={IS.body}>
          {/* Left panel */}
          <div style={IS.left}>
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontFamily: 'DM Sans',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: cfg.color,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {cfg.name} · {cfg.tagline}
              </div>
              <button
                onClick={() => openChartTab(activeAsset)}
                title={`Open ${cfg.sym} candlestick chart in a new tab`}
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 58,
                  fontWeight: 300,
                  color: '#ece4d4',
                  lineHeight: 1,
                  letterSpacing: -1,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: 10,
                  transition: 'color 0.15s, text-shadow 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = cfg.color;
                  e.currentTarget.style.textShadow = `0 0 24px ${cfg.color}55`;
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
                    fontSize: 10,
                    fontStyle: 'normal',
                    letterSpacing: 1.8,
                    color: 'rgba(255,255,255,0.32)',
                    textTransform: 'uppercase',
                    marginLeft: 4,
                  }}
                >
                  ↗ Chart
                </span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <span
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 15,
                    color: isBull ? '#4caf50' : '#ef5350',
                    fontWeight: 500,
                  }}
                >
                  {isBull ? '\u25b2' : '\u25bc'} {Math.abs(change).toFixed(2)}%
                </span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>24h change</span>
                {activeAsset === 'bitcoin' && price?.dominance && (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
                    Dom <span style={{ color: '#f7931a' }}>{price.dominance.toFixed(1)}%</span>
                  </span>
                )}
              </div>

              {/* Gold:Silver ratio — prominent, clickable pill (only for gold/silver).
                  Clicking toggles between the two sides of the ratio so users can
                  compare without hunting for the asset tab. */}
              {activeAsset !== 'bitcoin' && prices?.goldSilverRatio != null && (
                <button
                  onClick={() => setActiveAsset(activeAsset === 'gold' ? 'silver' : 'gold')}
                  title={`Gold:Silver ratio — historic mean ~60×. Above 80× = silver historically undervalued vs gold. Click to switch to ${activeAsset === 'gold' ? 'silver' : 'gold'}.`}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'linear-gradient(135deg, rgba(212,168,67,0.22) 0%, rgba(184,196,204,0.18) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(212,168,67,0.7)';
                    e.currentTarget.style.boxShadow = '0 0 18px rgba(212,168,67,0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      'linear-gradient(135deg, rgba(212,168,67,0.13) 0%, rgba(184,196,204,0.1) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(212,168,67,0.45)';
                    e.currentTarget.style.boxShadow = '0 0 12px rgba(212,168,67,0.18)';
                  }}
                  style={{
                    marginTop: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 18px',
                    background:
                      'linear-gradient(135deg, rgba(212,168,67,0.13) 0%, rgba(184,196,204,0.1) 100%)',
                    border: '1px solid rgba(212,168,67,0.45)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 0 12px rgba(212,168,67,0.18)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span
                      style={{
                        fontFamily: 'DM Sans',
                        fontSize: 9,
                        letterSpacing: 2,
                        color: 'rgba(255,255,255,0.55)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Au : Ag Ratio
                    </span>
                    <span
                      style={{
                        fontFamily: 'Cormorant Garamond, serif',
                        fontSize: 26,
                        fontWeight: 400,
                        color: '#f3d98a',
                        lineHeight: 1,
                      }}
                    >
                      {prices.goldSilverRatio.toFixed(1)}
                      <span style={{ fontSize: 16, color: 'rgba(243,217,138,0.7)', marginLeft: 2 }}>×</span>
                    </span>
                  </div>
                  <div
                    style={{
                      width: 1,
                      alignSelf: 'stretch',
                      background: 'rgba(255,255,255,0.12)',
                      margin: '2px 0',
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span
                      style={{
                        fontFamily: 'DM Sans',
                        fontSize: 9.5,
                        color:
                          prices.goldSilverRatio >= 80
                            ? '#7dd689'
                            : prices.goldSilverRatio <= 50
                            ? '#ff8a86'
                            : 'rgba(255,255,255,0.55)',
                        fontWeight: 600,
                        letterSpacing: 0.4,
                      }}
                    >
                      {prices.goldSilverRatio >= 80
                        ? 'Silver undervalued'
                        : prices.goldSilverRatio <= 50
                        ? 'Silver expensive'
                        : 'Near historical mean'}
                    </span>
                    <span
                      style={{
                        fontFamily: 'DM Sans',
                        fontSize: 9.5,
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      Mean ~60× · Click to view {activeAsset === 'gold' ? 'silver' : 'gold'} \u21c4
                    </span>
                  </div>
                </button>
              )}
            </div>

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 9,
                    letterSpacing: 3,
                    color: 'rgba(255,255,255,0.22)',
                    textTransform: 'uppercase',
                  }}
                >
                  Market Conditions
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'DM Sans',
                    fontSize: 9,
                    letterSpacing: 1.6,
                    color: 'rgba(255,255,255,0.32)',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#f5d78e',
                      boxShadow: '0 0 6px #f5d78eaa',
                      animation: 'gilverCondPulse 1.4s infinite',
                    }}
                  />
                  Live now
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {cond.bull.map((b, i) => (
                  <span
                    key={i}
                    title={b.active ? b.why ?? 'Currently playing out' : b.text}
                    style={{
                      position: 'relative',
                      fontFamily: 'DM Sans',
                      fontSize: b.active ? 11 : 10,
                      fontWeight: b.active ? 600 : 400,
                      color: b.active ? '#7dd689' : 'rgba(76,175,80,0.55)',
                      background: b.active ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.05)',
                      border: b.active
                        ? '1px solid rgba(76,175,80,0.55)'
                        : '1px solid rgba(76,175,80,0.1)',
                      boxShadow: b.active ? '0 0 10px rgba(76,175,80,0.25)' : 'none',
                      borderRadius: 20,
                      padding: b.active ? '5px 11px 5px 20px' : '4px 10px',
                      transition: 'all 0.2s',
                    }}
                  >
                    {b.active && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#4caf50',
                          boxShadow: '0 0 6px #4caf50',
                          animation: 'gilverCondPulse 1.4s infinite',
                        }}
                      />
                    )}
                    + {b.text}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cond.bear.map((b, i) => (
                  <span
                    key={i}
                    title={b.active ? b.why ?? 'Currently playing out' : b.text}
                    style={{
                      position: 'relative',
                      fontFamily: 'DM Sans',
                      fontSize: b.active ? 11 : 10,
                      fontWeight: b.active ? 600 : 400,
                      color: b.active ? '#ff8a86' : 'rgba(239,83,80,0.55)',
                      background: b.active ? 'rgba(239,83,80,0.15)' : 'rgba(239,83,80,0.04)',
                      border: b.active
                        ? '1px solid rgba(239,83,80,0.55)'
                        : '1px solid rgba(239,83,80,0.1)',
                      boxShadow: b.active ? '0 0 10px rgba(239,83,80,0.22)' : 'none',
                      borderRadius: 20,
                      padding: b.active ? '5px 11px 5px 20px' : '4px 10px',
                      transition: 'all 0.2s',
                    }}
                  >
                    {b.active && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#ef5350',
                          boxShadow: '0 0 6px #ef5350',
                          animation: 'gilverCondPulse 1.4s infinite',
                        }}
                      />
                    )}
                    − {b.text}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontFamily: 'DM Sans',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: 'rgba(255,255,255,0.22)',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                Holdings Breakdown
              </div>
              {cond.sectors.map((s, i) => (
                <div key={i} style={{ marginBottom: 11 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'DM Sans',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: 5,
                    }}
                  >
                    <span>{s.l}</span>
                    <span style={{ color: cfg.color }}>{s.pct}%</span>
                  </div>
                  <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${s.pct}%`,
                        background: `linear-gradient(to right, ${cfg.color}99, ${cfg.color})`,
                        borderRadius: 1,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel — AI Intelligence */}
          <div style={IS.right}>
            <div style={{ ...IS.card, borderColor: cfg.colorBorder, flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 24,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 9,
                      letterSpacing: 3,
                      color: 'rgba(255,255,255,0.25)',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    AI Market Intelligence
                  </div>
                  <div
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontSize: 26,
                      color: cfg.color,
                      fontStyle: 'italic',
                    }}
                  >
                    {cfg.tagline}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: loading ? '#f5d78e' : '#4caf50',
                      boxShadow: `0 0 8px ${loading ? '#f5d78e' : '#4caf50'}`,
                      animation: loading ? 'gilverIPulse 1s infinite' : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 9,
                      letterSpacing: 1.5,
                      color: 'rgba(255,255,255,0.2)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {loading ? 'Analyzing' : 'Live'}
                  </span>
                </div>
              </div>

              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[100, 88, 94, 78, 90, 83].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        height: 13,
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 3,
                        width: `${w}%`,
                        animation: 'gilverIShim 1.8s infinite',
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 13.5,
                    lineHeight: 1.9,
                    color: 'rgba(232,224,208,0.82)',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {analysis[activeAsset] || 'Waiting for live price data\u2026'}
                </div>
              )}
            </div>

            {/* Sentiment */}
            <div style={{ ...IS.card, borderColor: 'rgba(255,255,255,0.07)' }}>
              <div
                style={{
                  fontFamily: 'DM Sans',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: 'rgba(255,255,255,0.22)',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                }}
              >
                Weekly Sentiment
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(239,83,80,0.7)', letterSpacing: 1 }}>
                      FEAR
                    </span>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 9, color: 'rgba(76,175,80,0.7)', letterSpacing: 1 }}>
                      GREED
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      background: 'linear-gradient(to right, #ef5350, #555, #4caf50)',
                      borderRadius: 2,
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: -5,
                        left: `${Math.max(4, Math.min(96, 50 + change * 4))}%`,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#fff',
                        transform: 'translateX(-50%)',
                        boxShadow: '0 0 8px rgba(255,255,255,0.5)',
                        transition: 'left 0.6s cubic-bezier(.4,0,.2,1)',
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: 30,
                    fontStyle: 'italic',
                    color: isBull ? '#4caf50' : '#ef5350',
                    minWidth: 64,
                    textAlign: 'right',
                  }}
                >
                  {isBull ? 'Bull' : 'Bear'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gilverIPulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes gilverIShim  { 0%,100%{opacity:.25} 50%{opacity:.55} }
        @keyframes gilverCondPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>
    </div>
  );
};

const IS: Record<string, React.CSSProperties> = {
  page: { width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#06060e' },
  tabs: { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  tab: { flex: 1, padding: '18px 24px', border: 'none', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' },
  body: { flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, overflow: 'hidden' },
  left: { padding: '28px 28px 24px', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto' },
  right: { padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' },
  card: { background: 'rgba(255,255,255,0.025)', border: '1px solid', borderRadius: 6, padding: '22px 24px' },
};
