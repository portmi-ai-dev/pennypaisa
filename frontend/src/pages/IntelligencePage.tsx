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
import { ASSET_CONFIG, type AssetKey, type Prices } from '../lib/marketData';
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

// ─── Curated REGIME call per asset ────────────────────────────────────────
// Single source of truth for the page's "Bull / Bear / Mixed" consensus.
// Both the header pill (top of main column) and the right-side Explainer
// panel default view read from THIS map — they used to compute regime
// independently (24h price action vs active-driver count) and could
// disagree, which they did. Now they always match.
//
// This is hand-curated, not derived: a regime call factors in cycle
// position and dominant near-term forces, not just a count of active
// pros vs cons. A future version could compute this from real-time data
// + an AI synthesis pass.
const CONSENSUS_REGIME: Record<AssetKey, 'Bull' | 'Bear' | 'Mixed'> = {
  gold:    'Bear', // Cyclic ATH wave done; consolidation + strong USD now dominant
  silver:  'Bear', // Post-parabolic profit-taking; gold sideways removes lead
  bitcoin: 'Bear', // Cycle peaked late 2025; next bull phase post-Apr-2028 halving
};

// Hand-curated synthesis paragraph per asset — explains *why* the asset
// sits in its current regime, woven from the active bull / bear drivers.
// Surfaces in the right-side Explainer panel as the default (no-hover)
// state. Update these whenever the macro regime materially shifts.
const CONSENSUS_NARRATIVE: Record<AssetKey, string> = {
  gold:
    'Gold is in a near-term bearish phase. The 15-year cyclic ATH wave has played out — the ' +
    'structural up-move is exhausted for now and price is settling into a multi-month ' +
    'consolidation. Strong US-dollar pressure and cooling CPI are removing the inflation-hedge ' +
    'bid. Sovereign demand (central banks adding 1,000+ tonnes/yr) and geopolitical risk ' +
    '(Iran-US war, Ukraine, Middle East) provide a structural floor, but in the near term the ' +
    'consolidation + strong-USD setup dominates the tape.',
  silver:
    'Silver is in a bear phase after the parabolic spike. The classic 40–60% post-peak ' +
    'drawdown is playing out, and gold consolidating at the same time removes silver’s ' +
    'lead-from-the-top dynamic. Structural demand stories — supply deficit, AI / data centres, ' +
    'solar / EV — remain intact for the long term, but silver’s ~2.5x beta to gold is ' +
    'amplifying the downside in the near term.',
  bitcoin:
    'Bitcoin has peaked in this cycle. Every prior 4-year cycle has been followed by a 70-85% ' +
    'drawdown from peak, and we are in the early stages of that pattern. Spot-ETF flows past ' +
    '$100B AUM and the US Strategic Bitcoin Reserve (207K BTC) provide a structural bid floor ' +
    'that may make this drawdown shallower than 2018 or 2022, but elevated macro volatility — ' +
    'tariffs, credit spreads — means BTC is the first asset sold in any global liquidation. ' +
    'The next major bull phase is unlikely until after the April 2028 halving.',
};

const COND: Record<AssetKey, ConditionConfig> = {
  gold: {
    bull: [
      // Cyclic ATH wave is COMPLETE — the move higher has played out.
      { text: 'Cyclic ATH pattern (~15yr cycles)', why: 'Cycle complete; structural ATH wave has played out.' },
      { text: 'War & geopolitical fear', active: true, why: 'Iran-US war on top of ongoing Ukraine + Middle East conflicts.' },
      { text: 'Inflation hedge', active: true, why: 'Real yields still negative for much of the curve — gold preferred over cash.' },
      { text: 'De-dollarization', active: true, why: 'BRICS+ reserve diversification accelerating. USD share of global reserves falling.' },
      { text: 'Central bank accumulation', active: true, why: 'Record central-bank buying for the 4th consecutive year.' },
      { text: 'Weak US Dollar demand', why: 'DXY has firmed back above prior support — weak-dollar bid not in play.' },
    ],
    bear: [
      // Newly active: range-bound consolidation has started post-cycle peak.
      { text: 'Prolonged consolidation periods', active: true, why: 'Multi-month sideways range after the 2026 ATH; momentum exhausted.' },
      // Newly active: USD has firmed and is pressuring gold.
      { text: 'Strong US Dollar', active: true, why: 'DXY firm; gold mechanically pressured (inverse correlation).' },
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
      // Gold cycle has played out — silver lag advantage is no longer in play.
      { text: 'Follows gold bull cycles', why: 'Gold cycle complete; silver lag-from-the-top dynamic is over for this cycle.' },
      { text: 'Dual store-of-value identity' },
    ],
    bear: [
      // Newly active: parabolic peak retraced, classic silver profit-taking pattern playing out.
      { text: 'Massive profit-taking after parabolic rises', active: true, why: 'Silver dumped from cycle peak — classic 40-60% retrace under way.' },
      { text: 'Narrative exaggeration near tops' },
      // Newly active: gold sideways drags silver per the lag-divergence dynamic.
      { text: 'Gold consolidation drags silver', active: true, why: 'Gold range-bound — silver loses its lead-from-the-top dynamic.' },
      { text: 'High volatility downside risk', active: true, why: 'Silver beta to gold remains elevated — drawdowns are amplified.' },
      { text: 'Industrial slowdown scenarios' },
    ],
  },
  bitcoin: {
    bull: [
      // Halving cycle bull phase is OVER — next halving is April 2028.
      { text: '4-year halving cycle bull phase', why: 'Post-2024-halving bull peaked late 2025. Next phase post-April-2028 halving.' },
      { text: 'Fed rate cuts & M2 expansion' },
      { text: 'Institutional & ETF adoption', active: true, why: 'Spot BTC ETFs continue absorbing — sticky long-term capital floor.' },
      { text: 'Government treasury accumulation', active: true, why: 'US Strategic Bitcoin Reserve (207K BTC) + sovereign buyers active.' },
      { text: 'Falling DXY tailwind' },
    ],
    bear: [
      // Newly active: cycle has peaked; drawdown phase begins.
      { text: '70%+ post-cycle drawdowns', active: true, why: 'Cycle peaked late 2025 — historical pattern targets 70-85% drawdown from peak.' },
      { text: 'FUD & macro shock risk', active: true, why: 'Elevated macro volatility — tariff-related, credit spreads widening.' },
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
  /** Asset's full driver list — drives the consensus default state. */
  cond: ConditionConfig;
  /** Curated regime call — must match the header pill. */
  regime: 'Bull' | 'Bear' | 'Mixed';
}

const ExplainerPanel: React.FC<ExplainerProps> = ({ hovered, asset, cond, regime }) => {
  // Default state when nothing's hovered: a synthesised CONSENSUS view that
  // explains *why* the asset is in its current regime — regime tag, a
  // bull-vs-bear count strip, the curated narrative paragraph, and the
  // actual active drivers underneath. Regime label comes from the SAME
  // curated CONSENSUS_REGIME map the header pill reads, so the two are
  // guaranteed to agree.
  if (!hovered) {
    const assetName = ASSET_CONFIG[asset].name;
    const activeBull = cond.bull.filter(c => c.active);
    const activeBear = cond.bear.filter(c => c.active);
    const regimeColor = regime === 'Bull' ? '#7dd689'
                      : regime === 'Bear' ? '#ff8a86'
                      : '#d4a843';
    const narrative = CONSENSUS_NARRATIVE[asset];
    // Bull/Bear weight bar — proportional split of active drivers.
    const total = activeBull.length + activeBear.length || 1;
    const bullPct = (activeBull.length / total) * 100;

    return (
      <div style={panelStyles.shell(regimeColor)}>
        <div style={panelStyles.eyebrow}>Asset Consensus</div>
        <div style={panelStyles.title(regimeColor)}>
          {assetName} · {regime}
        </div>

        {/* Driver count strip (bull green | bear red) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 18,
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 11.5,
          }}
        >
          <span style={{ color: '#7dd689', fontWeight: 600 }}>{activeBull.length} bull</span>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${bullPct}%`, background: '#7dd689', opacity: 0.78 }} />
            <div style={{ flex: 1, background: '#ff8a86', opacity: 0.78 }} />
          </div>
          <span style={{ color: '#ff8a86', fontWeight: 600 }}>{activeBear.length} bear</span>
        </div>

        {/* Synthesis paragraph */}
        <div style={{ ...panelStyles.eyebrow, color: 'rgba(255,255,255,0.4)' }}>
          Why {regime.toLowerCase()}ish
        </div>
        <div style={panelStyles.body}>{narrative}</div>

        {/* Active driver lists — clean bullets, asset-tinted dots */}
        {activeBull.length > 0 && (
          <>
            <div style={{ ...panelStyles.eyebrow, marginTop: 18, color: '#7dd689' }}>
              Bullish forces in play
            </div>
            <ul style={{ ...panelStyles.list, color: 'rgba(232,224,208,0.84)' }}>
              {activeBull.map((c, i) => (
                <li key={i} style={panelStyles.listItem}>
                  <span style={{ ...panelStyles.bullet, background: '#4caf50' }} />
                  {c.text}
                </li>
              ))}
            </ul>
          </>
        )}
        {activeBear.length > 0 && (
          <>
            <div style={{ ...panelStyles.eyebrow, marginTop: 14, color: '#ff8a86' }}>
              Bearish forces in play
            </div>
            <ul style={{ ...panelStyles.list, color: 'rgba(232,224,208,0.84)' }}>
              {activeBear.map((c, i) => (
                <li key={i} style={panelStyles.listItem}>
                  <span style={{ ...panelStyles.bullet, background: '#ef5350' }} />
                  {c.text}
                </li>
              ))}
            </ul>
          </>
        )}

        <div style={panelStyles.divider} />
        <div style={{ ...panelStyles.eyebrow, marginTop: 14, color: 'rgba(255,255,255,0.32)' }}>
          Hover any driver card on the left for its full plain-English explanation.
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
  // Compact bullet list — used by the consensus view to render the active
  // bullish/bearish drivers underneath the synthesis paragraph.
  list: {
    listStyle: 'none',
    margin: '8px 0 0',
    padding: 0,
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 13.5,
    lineHeight: 1.55,
  } as React.CSSProperties,
  listItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    paddingLeft: 2,
    marginBottom: 5,
  } as React.CSSProperties,
  bullet: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: 7,
    boxShadow: '0 0 5px currentColor',
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
  // Single curated regime call — drives the header pill AND the
  // right-side Explainer panel default state, so the two never disagree
  // (the previous setup had the pill on 24h price action and the panel
  // on driver counts, which produced opposite labels for the same asset).
  const regime = CONSENSUS_REGIME[activeAsset];
  const activeBull = cond.bull.filter((c) => c.active).length;
  const activeBear = cond.bear.filter((c) => c.active).length;

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
              {/* HEADER — Bull / Bear / Mixed consensus pill driven by
                  the curated CONSENSUS_REGIME constant. Same value drives
                  the side panel so both stay consistent. */}
              {(() => {
                const palette = regime === 'Bull'
                  ? { fg: '#7dd689', bg: 'rgba(76,175,80,0.12)',  bd: 'rgba(76,175,80,0.40)',  gl: 'rgba(76,175,80,0.18)' }
                  : regime === 'Bear'
                  ? { fg: '#ff8a86', bg: 'rgba(239,83,80,0.10)',  bd: 'rgba(239,83,80,0.40)',  gl: 'rgba(239,83,80,0.16)' }
                  : { fg: '#d4a843', bg: 'rgba(212,168,67,0.10)', bd: 'rgba(212,168,67,0.40)', gl: 'rgba(212,168,67,0.16)' };
                return (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 18px',
                      borderRadius: 22,
                      background: palette.bg,
                      border: `1px solid ${palette.bd}`,
                      boxShadow: `0 0 18px ${palette.gl}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 9.5,
                        letterSpacing: 2.5,
                        color: 'rgba(255,255,255,0.5)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Consensus
                    </span>
                    <span
                      style={{
                        fontFamily: 'Cormorant Garamond, serif',
                        fontSize: 26,
                        fontStyle: 'italic',
                        color: palette.fg,
                        lineHeight: 1,
                      }}
                    >
                      {regime}
                    </span>
                  </div>
                );
              })()}

              {/* MARKET CONDITIONS */}
              <div style={{ marginTop: 32 }}>
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
          <ExplainerPanel
            hovered={hoveredDriver}
            asset={activeAsset}
            cond={cond}
            regime={regime}
          />
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
