// Shared market data types & helpers used across the Gilver pages.

export type AssetKey = 'gold' | 'silver' | 'bitcoin';

export interface AssetPrice {
  price: number;
  changePercent24h: number;
  weeklyChangePercent?: number;
  marketCap?: number;
  dominance?: number;
  volume24h?: number;
}

export interface Prices {
  gold: AssetPrice;
  silver: AssetPrice;
  bitcoin: AssetPrice;
  goldSilverRatio: number;
  isWeekend?: boolean;
}

// Per-asset sentiment summary fetched from Gemini with Google Search grounding.
// Surfaced on bullion-hover overlays, the Intelligence page, and (now) injected
// into the Smart Asset chat system prompt so each character's tone reflects
// today's market read.
export interface AssetSentiment {
  marketType: 'bull' | 'bear' | 'neutral';
  reasoning: string;
  cowenView: string;
  solowayView: string;
  lastUpdated?: string;
}

export type Sentiments = Partial<Record<AssetKey, AssetSentiment | null>>;

// Visual config per asset, mirroring the Gilver design palette.
export const ASSET_CONFIG: Record<
  AssetKey,
  {
    name: string;
    sym: string;
    tagline: string;
    color: string;
    colorDim: string;
    colorBorder: string;
    avatar: string;
  }
> = {
  gold: {
    name: 'Gold',
    sym: 'XAU',
    tagline: 'The Stoic Guardian',
    color: '#d4a843',
    colorDim: 'rgba(212,168,67,0.08)',
    colorBorder: 'rgba(212,168,67,0.22)',
    avatar: 'Au',
  },
  silver: {
    name: 'Silver',
    sym: 'XAG',
    tagline: 'The Industrialist',
    color: '#8fb8cc',
    colorDim: 'rgba(143,184,204,0.08)',
    colorBorder: 'rgba(143,184,204,0.22)',
    avatar: 'Ag',
  },
  bitcoin: {
    name: 'Bitcoin',
    sym: 'BTC',
    tagline: 'The Digital Maverick',
    color: '#f7931a',
    colorDim: 'rgba(247,147,26,0.08)',
    colorBorder: 'rgba(247,147,26,0.22)',
    avatar: '\u20bf', // ₿
  },
};

export function formatPrice(asset: AssetKey, p?: AssetPrice | null): string {
  if (!p || p.price == null) return '\u2014';
  return asset === 'bitcoin'
    ? `$${p.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${p.price.toFixed(2)}`;
}

export function formatChange(p?: AssetPrice | null): string {
  if (!p || p.changePercent24h == null) return '';
  const v = p.changePercent24h;
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function changeColor(p?: AssetPrice | null): string {
  return (p?.changePercent24h ?? 0) >= 0 ? '#4caf50' : '#ef5350';
}

// Maps the frontend AssetKey to the asset slug used by the backend
// `/api/history/{asset}` endpoint (which expects `gold|silver|btc`).
export function assetToBackend(asset: AssetKey): 'gold' | 'silver' | 'btc' {
  return asset === 'bitcoin' ? 'btc' : asset;
}

// Opens the candlestick chart for a given asset in a new browser tab.
// The `?chart=<asset>` query param is detected at app startup and rendered
// as a dedicated full-screen ChartPage (no header, no 3D scene).
export function openChartTab(asset: AssetKey): void {
  if (typeof window === 'undefined') return;
  const url = `${window.location.pathname}?chart=${asset}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Per the Building-the-Product spec: weekly % change drives the visual state of
// each 3D asset. Returns a human-readable tier label and a tone (positive/negative/neutral).
export interface VisualTier {
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
  intensity: 0 | 1 | 2 | 3; // 0 = no change, 1..3 = ascending intensity
}

export function visualTier(asset: AssetKey, weeklyPct: number | undefined): VisualTier {
  if (weeklyPct === undefined || weeklyPct === null || isNaN(weeklyPct)) {
    return { label: 'Awaiting feed', tone: 'neutral', intensity: 0 };
  }
  const v = weeklyPct;
  // Gold thresholds (spec §Asset: GOLD)
  if (asset === 'gold') {
    if (v > 3) return { label: 'Ultra-charged · Aura', tone: 'positive', intensity: 3 };
    if (v > 1.5) return { label: 'Super-charged', tone: 'positive', intensity: 2 };
    if (v > 0.5) return { label: 'Charged', tone: 'positive', intensity: 1 };
    if (v < -3) return { label: 'Fissures · Heavy melt', tone: 'negative', intensity: 3 };
    if (v < -1.5) return { label: 'Cracks · Slight melt', tone: 'negative', intensity: 2 };
    if (v < -0.5) return { label: 'Hairline cracks', tone: 'negative', intensity: 1 };
    return { label: 'Stable', tone: 'neutral', intensity: 0 };
  }
  // Silver thresholds (spec §Asset: SILVER) — wider bands, silver is more volatile
  if (asset === 'silver') {
    if (v > 10) return { label: 'Ultra-charged · Aura', tone: 'positive', intensity: 3 };
    if (v > 5) return { label: 'Super-charged', tone: 'positive', intensity: 2 };
    if (v > 1) return { label: 'Charged', tone: 'positive', intensity: 1 };
    if (v < -10) return { label: 'Fissures · Heavy melt', tone: 'negative', intensity: 3 };
    if (v < -5) return { label: 'Cracks · Slight melt', tone: 'negative', intensity: 2 };
    if (v < -1.5) return { label: 'Hairline cracks', tone: 'negative', intensity: 1 };
    return { label: 'Stable', tone: 'neutral', intensity: 0 };
  }
  // Bitcoin thresholds (spec §Asset: BITCOIN)
  if (v > 10) return { label: 'To The Moon · Booster', tone: 'positive', intensity: 3 };
  if (v > 3) return { label: 'Booster engaged', tone: 'positive', intensity: 2 };
  if (v < -10) return { label: 'Deep cracks · Melt', tone: 'negative', intensity: 3 };
  if (v < -3) return { label: 'Cuboid cracks', tone: 'negative', intensity: 2 };
  return { label: 'Cuboid stable', tone: 'neutral', intensity: 0 };
}
