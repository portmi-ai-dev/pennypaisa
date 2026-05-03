// Intelligence page — gilver.ai
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │  Asset Selector  (Au / Ag / ₿ animated coins, click to switch)      │
//   ├──────────────────────────────────────────────────────────────────────┤
//   │  ┌─────────────────────────────────┐  ┌────────────────────────────┐ │
//   │  │  Header · Price · 24h · Bull/Bear│  │  Driver Explainer Panel  │ │
//   │  │  Market Conditions               │  │  (hover-reactive — shows │ │
//   │  │   ▸ Bullish drivers (rich cards)│  │   plain-English meaning  │ │
//   │  │   ▸ Bearish drivers (rich cards)│  │   of whichever driver    │ │
//   │  │  Active drivers expand into      │  │   the cursor is over)    │ │
//   │  │  rich cards with mini SVG vizes; │  │                          │ │
//   │  │  inactive drivers stay as pills. │  │                          │ │
//   │  └─────────────────────────────────┘  └────────────────────────────┘ │
//   └──────────────────────────────────────────────────────────────────────┘
//
// Two upgrades over the previous version:
//   (1) Asset selector replaces the flat tab row with three rotating
//       coin emblems (Au / Ag / ₿) — visual identity at a glance, the
//       active coin scales up + glows in its asset colour.
//   (2) Right-side Explainer panel — every driver pill is hover-reactive
//       and surfaces a longer plain-English explanation of what the
//       driver actually means (sourced from `driverExplanations.ts`).
//       Existing tooltip behaviour kept on top so the user gets both
//       inline glance + persistent reference reading.

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ASSET_CONFIG, openChartTab, type AssetKey, type Prices } from '../lib/marketData';
import { getDriverViz } from '../components/intelligenceViz';
import { getExplanation, type DriverExplanation } from '../lib/driverExplanations';

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
  active?: boolean;
  why?: string;
}

interface ConditionConfig {
  bull: Condition[];
  bear: Condition[];
}

const COND: Record<AssetKey, ConditionConfig> = {
  gold: {
    bull: [
      { text: 'Cyclic ATH pattern (~15yr cycles)', active: true, why: 'Gold breaking new all-time highs through 2025-26.' },
      { text: 'War & geopolitical fear', active: true, why: 'Active conflicts and elevated geopolitical risk premium.' },
      { text: 'Inflation hedge', active: true, why: 'Real yields still negative for much of the curve — gold preferred over cash.' },
      { text: 'De-dollarization', active: true, why: 'BRICS+ reserve diversification accelerating. USD share of global reserves falling.' },
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

// ─── ASSET EMBLEM (rotating coin) ─────────────────────────────────────────
// SVG-based 3D-effect coin. Outer wrapper sets perspective; inner
// `transformStyle: preserve-3d` group continuously rotates around Y. The
// coin face has a radial highlight + symbol embossing for depth. Active
// state intensifies the glow and bumps scale.

interface EmblemProps {
  assetKey: AssetKey;
  color: string;
  active: boolean;
  size?: number;
}

const AssetEmblem: React.FC<EmblemProps> = ({ assetKey, color, active, size = 76 }) => {
  // Per-asset metallic palette.
  const palette = (() => {
    if (assetKey === 'gold') return { hi: '#fff0c8', mid: '#e6c060', edge: '#7a5a20', text: '#3a2a08', glyph: 'Au' };
    if (assetKey === 'silver') return { hi: '#fbfdff', mid: '#c4cdd9', edge: '#5b6680', text: '#2a3040', glyph: 'Ag' };
    return { hi: '#ffe6c0', mid: '#f7931a', edge: '#7a3d00', text: '#2a1100', glyph: '₿' };
  })();
  const gradId = `emblemGrad-${assetKey}`;
  const ringId = `emblemRing-${assetKey}`;
  const shineId = `emblemShine-${assetKey}`;

  return (
    <div
      style={{
        perspective: size * 8,
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          animation: `gilverEmblemSpin ${active ? 8 : 14}s linear infinite`,
          opacity: active ? 1 : 0.55,
          transition: 'opacity 0.3s, filter 0.3s',
          filter: active ? `drop-shadow(0 0 18px ${color}80)` : 'none',
        }}
      >
        <svg viewBox="0 0 100 100" width={size} height={size}>
          <defs>
            <radialGradient id={gradId} cx="36%" cy="30%" r="80%">
              <stop offset="0%" stopColor={palette.hi} stopOpacity="0.95" />
              <stop offset="45%" stopColor={palette.mid} />
              <stop offset="100%" stopColor={palette.edge} />
            </radialGradient>
            <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={palette.hi} stopOpacity="0.55" />
              <stop offset="35%" stopColor={palette.hi} stopOpacity="0" />
              <stop offset="100%" stopColor={palette.hi} stopOpacity="0.18" />
            </linearGradient>
            <linearGradient id={ringId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.hi} stopOpacity="0.3" />
              <stop offset="100%" stopColor={palette.edge} stopOpacity="0.4" />
            </linearGradient>
          </defs>
          {/* Coin body */}
          <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} stroke={color} strokeWidth="1.5" />
          {/* Inner reeded ring */}
          <circle cx="50" cy="50" r="40" fill="none" stroke={`url(#${ringId})`} strokeWidth="0.8" strokeDasharray="0.8,0.8" />
          {/* Glyph */}
          <text
            x="50"
            y={assetKey === 'bitcoin' ? 64 : 62}
            textAnchor="middle"
            fill={palette.text}
            fontSize={assetKey === 'bitcoin' ? 38 : 28}
            fontWeight="700"
            fontFamily={assetKey === 'bitcoin' ? 'DM Sans, sans-serif' : 'Cormorant Garamond, serif'}
            style={{ paintOrder: 'stroke' }}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.4"
          >
            {palette.glyph}
          </text>
          {/* Top-left specular highlight */}
          <circle cx="50" cy="50" r="46" fill={`url(#${shineId})`} />
        </svg>
      </div>
    </div>
  );
};

// ─── ASSET SELECTOR (replaces flat tab row) ───────────────────────────────

interface SelectorProps {
  active: AssetKey;
  prices: Prices | null;
  onSelect: (k: AssetKey) => void;
}

const AssetSelector: React.FC<SelectorProps> = ({ active, prices, onSelect }) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '20px 26px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        background: 'rgba(8,8,16,0.55)',
      }}
    >
      {(Object.keys(ASSET_CONFIG) as AssetKey[]).map((key) => {
        const c = ASSET_CONFIG[key];
        const isActive = active === key;
        const p = prices?.[key];
        const ch = p?.changePercent24h ?? 0;
        const positive = ch >= 0;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 18px',
              borderRadius: 14,
              border: `1px solid ${isActive ? c.color : 'rgba(255,255,255,0.06)'}`,
              background: isActive
                ? `linear-gradient(135deg, ${c.colorDim}, rgba(8,8,16,0.6))`
                : 'rgba(255,255,255,0.015)',
              boxShadow: isActive ? `0 0 32px ${c.colorDim}, inset 0 0 24px rgba(0,0,0,0.4)` : 'none',
              cursor: 'pointer',
              transform: isActive ? 'translateY(-1px) scale(1.01)' : 'none',
              transition: 'all 0.25s ease',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = `${c.color}55`;
                e.currentTarget.style.background = `${c.colorDim}`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.015)';
              }
            }}
          >
            <AssetEmblem assetKey={key} color={c.color} active={isActive} size={68} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: isActive ? c.color : 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {c.sym} · {c.name}
              </div>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 26,
                  fontWeight: 300,
                  lineHeight: 1,
                  color: isActive ? '#ece4d4' : 'rgba(236,228,212,0.55)',
                  letterSpacing: -0.5,
                }}
              >
                {p
                  ? key === 'bitcoin'
                    ? `$${p.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : `$${p.price.toFixed(2)}`
                  : '—'}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 5,
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 11,
                  color: positive ? '#4caf50' : '#ef5350',
                  fontWeight: 500,
                }}
              >
                <span>{positive ? '▲' : '▼'}</span>
                <span>{positive ? '+' : ''}{ch.toFixed(2)}%</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginLeft: 4 }}>24H</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ─── DRIVER CARD (active = rich expanded card w/ viz; inactive = pill) ────

interface DriverCardProps {
  cond: Condition;
  isBull: boolean;
  color: string;
  onHoverStart: (cond: Condition, isBull: boolean) => void;
  onHoverEnd: () => void;
}

// Every driver — active OR inactive — renders as a rich card with an
// embedded SVG visualisation. Active state controls visual weight (full
// colour + pulse dot + glow) vs inactive (dimmed colour, no dot, no glow).
// Per user request: no more compact pills.
const DriverCard: React.FC<DriverCardProps> = ({ cond, isBull, color, onHoverStart, onHoverEnd }) => {
  const [hovered, setHovered] = useState(false);
  const prefix = isBull ? '+' : '−';
  const dotColor = isBull ? '#4caf50' : '#ef5350';

  // Two visual tracks: active (full weight) vs inactive (dimmed).
  const isActive = !!cond.active;
  const bg = isActive
    ? (isBull ? 'rgba(76,175,80,0.18)' : 'rgba(239,83,80,0.15)')
    : (isBull ? 'rgba(76,175,80,0.05)' : 'rgba(239,83,80,0.05)');
  const border = isActive
    ? (isBull ? 'rgba(76,175,80,0.55)' : 'rgba(239,83,80,0.55)')
    : (isBull ? 'rgba(76,175,80,0.20)' : 'rgba(239,83,80,0.20)');
  const labelColor = isActive
    ? (isBull ? '#7dd689' : '#ff8a86')
    : (isBull ? 'rgba(125,214,137,0.55)' : 'rgba(255,138,134,0.55)');
  const vizColor = isActive
    ? color
    : (isBull ? 'rgba(125,214,137,0.55)' : 'rgba(255,138,134,0.55)');
  const glow = isActive
    ? (isBull ? 'rgba(76,175,80,0.25)' : 'rgba(239,83,80,0.22)')
    : 'transparent';
  const hoverBg = isBull ? 'rgba(76,175,80,0.22)' : 'rgba(239,83,80,0.18)';
  const hoverBorder = isBull ? 'rgba(76,175,80,0.7)' : 'rgba(239,83,80,0.7)';

  const handleEnter = () => {
    setHovered(true);
    onHoverStart(cond, isBull);
  };
  const handleLeave = () => {
    setHovered(false);
    onHoverEnd();
  };

  const viz = getDriverViz(cond.text, vizColor);
  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        position: 'relative',
        background: hovered ? hoverBg : bg,
        border: `1px solid ${hovered ? hoverBorder : border}`,
        boxShadow: hovered
          ? `0 4px 24px ${isBull ? 'rgba(76,175,80,0.30)' : 'rgba(239,83,80,0.27)'}, 0 0 0 1px ${border}`
          : (isActive ? `0 0 12px ${glow}` : 'none'),
        opacity: hovered ? 1 : (isActive ? 1 : 0.78),
        borderRadius: 14,
        // Roomier padding so the bigger embedded charts breathe; min-width
        // keeps text-only / shorter cards aligned with chart-bearing ones.
        padding: viz ? '15px 18px 13px 26px' : '14px 18px 14px 26px',
        minWidth: 248,
        transition: 'all 0.2s ease',
        cursor: 'help',
        animation: 'gilverFadeUp 0.3s ease both',
      }}
    >
      {/* Live-pulse dot — ACTIVE drivers only */}
      {isActive && (
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: viz ? 14 : '50%',
            transform: viz ? 'none' : 'translateY(-50%)',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 7px ${dotColor}`,
            animation: 'gilverCondPulse 1.4s infinite',
            display: 'block',
          }}
        />
      )}
      <div
        style={{
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 12.5,
          fontWeight: 600,
          color: labelColor,
          marginBottom: viz ? 10 : 0,
          letterSpacing: 0.2,
        }}
      >
        {prefix} {cond.text}
      </div>
      {viz && (
        <div style={{ marginLeft: -2, opacity: hovered ? 1 : (isActive ? 0.85 : 0.7), transition: 'opacity 0.2s' }}>
          {viz}
        </div>
      )}
      {/* Inline tooltip preserved on active drivers — quick-glance live state */}
      {hovered && isActive && cond.why && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            background: 'rgba(10,10,20,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 10.5,
            fontFamily: 'DM Sans, sans-serif',
            color: 'rgba(255,255,255,0.78)',
            whiteSpace: 'nowrap',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {cond.why}
        </div>
      )}
    </div>
  );
};

// ─── EXPLAINER PANEL (right side, hover-reactive) ─────────────────────────

interface ExplainerProps {
  hovered: { cond: Condition; isBull: boolean } | null;
  asset: AssetKey;
  assetColor: string;
}

const ExplainerPanel: React.FC<ExplainerProps> = ({ hovered, asset, assetColor }) => {
  // Default state when nothing's hovered: short asset overview + glossary
  // legend so the panel never feels empty.
  if (!hovered) {
    const assetName = ASSET_CONFIG[asset].name;
    return (
      <div style={panelStyles.shell(assetColor)}>
        <div style={panelStyles.eyebrow}>Driver Explainer</div>
        <div style={panelStyles.title(assetColor)}>{assetName} · Glossary</div>
        <div style={panelStyles.body}>
          <p style={{ marginBottom: 12 }}>
            Hover any <strong style={{ color: '#7dd689' }}>green</strong> or
            {' '}<strong style={{ color: '#ff8a86' }}>red</strong> driver card to see
            a plain-English explanation here.
          </p>
          <p style={{ marginBottom: 12 }}>
            <strong style={{ color: assetColor }}>Active</strong> drivers (with the
            pulse dot and full colour) are forces meaningfully in play right now.
            <strong style={{ color: 'rgba(255,255,255,0.65)' }}> Dimmed</strong> drivers
            are part of the framework but not active in the current regime.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>
            Every card embeds a small visualisation showing the historical data
            behind the driver — peaks, deficits, accumulation curves, conflict
            timelines, etc.
          </p>
        </div>
        <div style={panelStyles.divider} />
        <div style={{ ...panelStyles.eyebrow, marginTop: 16, color: 'rgba(255,255,255,0.32)' }}>How drivers are picked</div>
        <div style={{ ...panelStyles.body, marginTop: 6 }}>
          The list is curated from analyst consensus, central-bank reports,
          ETF-flow data, and on-chain metrics. The <strong>active</strong> flag
          flips when the underlying condition crosses a measurable threshold.
        </div>
      </div>
    );
  }

  const exp: DriverExplanation = getExplanation(hovered.cond.text);
  const sideColor = hovered.isBull ? '#7dd689' : '#ff8a86';
  const accentBg = hovered.isBull ? 'rgba(76,175,80,0.10)' : 'rgba(239,83,80,0.10)';
  const accentBorder = hovered.isBull ? 'rgba(76,175,80,0.30)' : 'rgba(239,83,80,0.30)';
  return (
    <div style={panelStyles.shell(sideColor)}>
      <div style={panelStyles.eyebrow}>
        {hovered.isBull ? 'Bullish driver' : 'Bearish driver'}
      </div>
      <div style={panelStyles.title(sideColor)}>{hovered.cond.text}</div>

      {/* Active badge */}
      {hovered.cond.active && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            borderRadius: 14,
            background: accentBg,
            border: `1px solid ${accentBorder}`,
            fontSize: 10.5,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: sideColor,
            marginBottom: 16,
            fontFamily: 'DM Sans, sans-serif',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: sideColor,
              boxShadow: `0 0 7px ${sideColor}`,
              animation: 'gilverCondPulse 1.4s infinite',
            }}
          />
          Live now
        </div>
      )}

      {/* What it means */}
      <div style={{ ...panelStyles.eyebrow, color: 'rgba(255,255,255,0.4)' }}>What it means</div>
      <div style={panelStyles.body}>{exp.meaning}</div>

      {/* Why active right now */}
      {hovered.cond.active && hovered.cond.why && (
        <>
          <div style={{ ...panelStyles.eyebrow, marginTop: 16, color: sideColor }}>
            Why it&apos;s active right now
          </div>
          <div style={panelStyles.body}>{hovered.cond.why}</div>
        </>
      )}

      {/* Historical example */}
      {exp.example && (
        <>
          <div style={{ ...panelStyles.eyebrow, marginTop: 16, color: 'rgba(255,255,255,0.4)' }}>Historical example</div>
          <div
            style={{
              ...panelStyles.body,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.025)',
              borderLeft: `2px solid ${sideColor}`,
              borderRadius: 4,
              fontStyle: 'italic',
            }}
          >
            {exp.example}
          </div>
        </>
      )}
    </div>
  );
};

const panelStyles = {
  shell: (color: string): React.CSSProperties => ({
    width: 360,
    flexShrink: 0,
    padding: '26px 24px',
    borderLeft: '1px solid rgba(255,255,255,0.07)',
    background: `linear-gradient(180deg, ${color}0a 0%, transparent 60%)`,
    overflowY: 'auto',
  }),
  eyebrow: {
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 10,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  title: (color: string): React.CSSProperties => ({
    fontFamily: 'Cormorant Garamond, serif',
    fontSize: 28,
    lineHeight: 1.2,
    color,
    marginBottom: 16,
    fontWeight: 400,
  }),
  // Body copy bumped from 12 → 14.5 with looser line-height for comfortable
  // reading without zooming. Panel width grew from 320 → 360 to match.
  body: {
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 14.5,
    lineHeight: 1.7,
    color: 'rgba(232,224,208,0.84)',
  } as React.CSSProperties,
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '20px 0 0',
  } as React.CSSProperties,
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────

interface Props {
  prices: Prices | null;
}

export const IntelligencePage: React.FC<Props> = ({ prices }) => {
  const location = useLocation();
  const [activeAsset, setActiveAsset] = useState<AssetKey>(() => assetFromSearch(location.search));
  const [hoveredDriver, setHoveredDriver] = useState<{ cond: Condition; isBull: boolean } | null>(null);

  useEffect(() => {
    setActiveAsset(assetFromSearch(location.search));
  }, [location.search]);

  // Reset hovered driver when the asset changes — otherwise the panel could
  // be stuck explaining a Gold driver while the user has switched to BTC.
  useEffect(() => {
    setHoveredDriver(null);
  }, [activeAsset]);

  const cfg = ASSET_CONFIG[activeAsset];
  const cond = COND[activeAsset];
  const price = prices?.[activeAsset];
  const change = price?.changePercent24h ?? 0;
  const isBull = change >= 0;
  const activeBull = cond.bull.filter((c) => c.active).length;
  const activeBear = cond.bear.filter((c) => c.active).length;

  const fmtPrice = () => {
    if (!price) return '—';
    return activeAsset === 'bitcoin'
      ? `$${price.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${price.price.toFixed(2)}`;
  };

  return (
    <div style={IS.page}>
      {/* Ambient asset-tinted glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `radial-gradient(ellipse 60% 70% at 50% 30%, ${cfg.colorDim} 0%, transparent 70%)`,
          transition: 'background 0.6s ease',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* ── ASSET SELECTOR ── */}
        <AssetSelector active={activeAsset} prices={prices} onSelect={setActiveAsset} />

        {/* ── 2-COL BODY ── */}
        <div style={IS.body}>
          {/* Main column */}
          <div style={IS.mainCol}>
            <div style={IS.column}>
              {/* HEADER */}
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 10,
                  letterSpacing: 3.5,
                  color: cfg.color,
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                {cfg.name} · {cfg.tagline}
              </div>

              {/* PRICE — clickable */}
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
                    letterSpacing: 2,
                    color: 'rgba(255,255,255,0.32)',
                    textTransform: 'uppercase',
                    marginLeft: 4,
                  }}
                >
                  ↗ Chart
                </span>
              </button>

              {/* 24h + Bull/Bear */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
                <span
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 17,
                    color: isBull ? '#4caf50' : '#ef5350',
                    fontWeight: 600,
                  }}
                >
                  {isBull ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                </span>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>24h</span>
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
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
                    Dominance <span style={{ color: '#f7931a' }}>{price.dominance.toFixed(1)}%</span>
                  </span>
                )}
              </div>

              {/* MARKET CONDITIONS */}
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
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 10,
                        letterSpacing: 3.5,
                        color: 'rgba(255,255,255,0.35)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Market Conditions
                    </div>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                      {activeBull + activeBear} drivers playing out · {cond.bull.length + cond.bear.length} total
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      fontFamily: 'DM Sans, sans-serif',
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

                {/* BULLISH */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, letterSpacing: 2, color: '#4caf50', textTransform: 'uppercase', fontWeight: 600 }}>
                      Bullish drivers
                    </span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9.5, color: 'rgba(76,175,80,0.5)' }}>
                      {activeBull}/{cond.bull.length} active
                    </span>
                  </div>
                  {/* All bullish drivers — active and inactive both render
                      as rich cards. Active ones are ordered first so the
                      live-now state catches the eye. */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[...cond.bull].sort((a, b) => Number(!!b.active) - Number(!!a.active)).map((c, i) => (
                      <DriverCard
                        key={i}
                        cond={c}
                        isBull
                        color="#7dd689"
                        onHoverStart={(cd, ib) => setHoveredDriver({ cond: cd, isBull: ib })}
                        onHoverEnd={() => setHoveredDriver(null)}
                      />
                    ))}
                  </div>
                </div>

                {/* BEARISH */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10, letterSpacing: 2, color: '#ef5350', textTransform: 'uppercase', fontWeight: 600 }}>
                      Bearish drivers
                    </span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 9.5, color: 'rgba(239,83,80,0.5)' }}>
                      {activeBear}/{cond.bear.length} active
                    </span>
                  </div>
                  {/* All bearish drivers — active first, inactive after. */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[...cond.bear].sort((a, b) => Number(!!b.active) - Number(!!a.active)).map((c, i) => (
                      <DriverCard
                        key={i}
                        cond={c}
                        isBull={false}
                        color="#ff8a86"
                        onHoverStart={(cd, ib) => setHoveredDriver({ cond: cd, isBull: ib })}
                        onHoverEnd={() => setHoveredDriver(null)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right-side Explainer panel */}
          <ExplainerPanel hovered={hoveredDriver} asset={activeAsset} assetColor={cfg.color} />
        </div>
      </div>

      <style>{`
        @keyframes gilverCondPulse  { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes gilverFadeUp     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes gilverEmblemSpin { from{transform:rotateY(0deg)} to{transform:rotateY(360deg)} }
        .iv-line { stroke-dasharray: 1000; animation: gilverDrawLine 1.5s ease forwards; }
        @keyframes gilverDrawLine { from{stroke-dashoffset:1000} to{stroke-dashoffset:0} }
      `}</style>
    </div>
  );
};

const IS: Record<string, React.CSSProperties> = {
  page: { width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#06060e' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  mainCol: { flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' },
  // Wider column so the larger driver cards still fit ~3-per-row.
  column: { width: '100%', maxWidth: 880, padding: '40px 36px 56px' },
};
