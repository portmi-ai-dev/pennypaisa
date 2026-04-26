// Capital Flow data layer — Lean MVP.
//
// Hierarchy (per user spec):
//   Precious Metals → Gold, Silver
//   Crypto          → BTC, ETH, USDT, SOL
//   Stocks          → Energy, Tech, Micro-Caps, Finance
//   Cash / Fiat     → DXY (USD vs basket)
//   Bonds           → T-Bills, Long Treasuries, Corporates
//
// Sources:
//   - Crypto: CoinGecko free `/coins/markets` (no auth, CORS-friendly)
//   - Gold/Silver: passed in from App's existing `prices` prop
//   - Stocks/Bonds/Cash: Yahoo Finance via `corsDomain=finance.yahoo.com` hack;
//     when CORS blocks (typical in browsers), we fall back to a deterministic
//     per-day synthetic seeded by today's date so values are stable across renders
//     but realistic (correlated with metals/crypto in plausible ways).
//
// Flow math: relative-momentum proxy.
//   Flow(A→B).strength = clamp(|B.chg − A.chg| × 0.45)
//   direction = sign(B.chg − A.chg)
// This is *not* literal dollar tracking (impossible client-side); it visualises
// where capital is gravitating on a relative-performance basis. The narrative
// strings explicitly call out this caveat.

export type Range = '24h' | '7d' | '30d';

export type SectorId = 'metals' | 'crypto' | 'stocks' | 'cash' | 'bonds';

export interface AssetNode {
  id: string;          // unique node id
  label: string;       // display name
  sub?: string;        // subtitle / ticker
  chg: number;         // % change over selected range
  mcap: number;        // approx market cap (trillions USD) — used for node sizing
  color: string;
  parent: SectorId;
  /** Single Unicode glyph rendered inside the child bubble as an icon
   * (e.g. ₿ for Bitcoin, Au for Gold). Kept as text rather than imported PNGs
   * so the canvas remains zero-asset; swap to brand SVGs in a follow-up. */
  icon?: string;
}

export interface Sector {
  id: SectorId;
  label: string;
  sub: string;
  color: string;
  // computed:
  chg: number;       // mcap-weighted average of children
  mcap: number;      // sum of children
  children: AssetNode[];
  /** true when at least one child used real (network) data */
  realData: boolean;
}

export interface FlowData {
  sectors: Sector[];
  sectorIndex: Record<SectorId, Sector>;
  fetchedAt: number;
}

export interface Flow {
  from: string;
  to: string;
  strength: number;
  dir: 1 | -1;
}

// ─── Helpers ────────────────────────────────────────────────────────────

// FNV-1a hash of the (date, range, key) tuple → stable [0, 1).
function seededRand(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function noisy(key: string, base: number, amp: number): number {
  return base + (seededRand(key) - 0.5) * amp * 2;
}

// ─── CoinGecko ──────────────────────────────────────────────────────────

interface CGCoin {
  id: string;
  price_change_percentage_24h?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

// All network calls hard-timeout at 5s so a hung request can never block the UI.
const FETCH_TIMEOUT_MS = 5000;
const withTimeout = (): RequestInit => {
  // AbortSignal.timeout exists in modern browsers; fall back to no signal on legacy.
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return {};
};

async function fetchCrypto(range: Range): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const url =
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&ids=bitcoin,ethereum,tether,solana' +
      '&price_change_percentage=24h,7d,30d&per_page=10';
    const res = await fetch(url, withTimeout());
    if (!res.ok) return out;
    const data = (await res.json()) as CGCoin[];
    for (const c of data) {
      const v =
        range === '7d'
          ? c.price_change_percentage_7d_in_currency
          : range === '30d'
          ? c.price_change_percentage_30d_in_currency
          : c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
      if (typeof v === 'number') out[c.id] = v;
    }
    return out;
  } catch {
    return out;
  }
}

// ─── Yahoo Finance (best-effort) ────────────────────────────────────────

async function fetchYahoo(symbol: string, range: Range): Promise<number | null> {
  const r = range === '30d' ? '1mo' : range === '7d' ? '5d' : '5d'; // 5d gives enough closes for "24h" too
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=${r}&corsDomain=finance.yahoo.com`;
    const res = await fetch(url, withTimeout());
    if (!res.ok) return null;
    const d = (await res.json()) as {
      chart?: {
        result?: Array<{
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const closesRaw = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closesRaw)) return null;
    const closes = closesRaw.filter((v): v is number => typeof v === 'number');
    if (closes.length < 2) return null;
    if (range === '24h') {
      // last vs second-last close
      const a = closes[closes.length - 2];
      const b = closes[closes.length - 1];
      return ((b - a) / a) * 100;
    }
    const a = closes[0];
    const b = closes[closes.length - 1];
    return ((b - a) / a) * 100;
  } catch {
    return null;
  }
}

// ─── Main fetcher ───────────────────────────────────────────────────────

interface Inputs {
  range: Range;
  goldChg?: number;
  silverChg?: number;
}

export async function fetchFlowData({
  range,
  goldChg,
  silverChg,
}: Inputs): Promise<FlowData> {
  // allSettled — even if Yahoo blocks every request, we still resolve and fall back to synthetic.
  const settled = await Promise.allSettled([
    fetchCrypto(range),
    fetchYahoo('QQQ', range),
    fetchYahoo('XLE', range),
    fetchYahoo('IWM', range),
    fetchYahoo('XLF', range),
    fetchYahoo('TLT', range),
    fetchYahoo('SHY', range),
    fetchYahoo('LQD', range),
    fetchYahoo('DX-Y.NYB', range),
  ]);
  const valOf = <T>(idx: number, fallback: T): T => {
    const r = settled[idx];
    return r.status === 'fulfilled' ? (r.value as T) : fallback;
  };
  const crypto = valOf<Record<string, number>>(0, {});
  const qqq = valOf<number | null>(1, null);
  const xle = valOf<number | null>(2, null);
  const iwm = valOf<number | null>(3, null);
  const xlf = valOf<number | null>(4, null);
  const tlt = valOf<number | null>(5, null);
  const shy = valOf<number | null>(6, null);
  const lqd = valOf<number | null>(7, null);
  const dxy = valOf<number | null>(8, null);

  const today = new Date().toISOString().slice(0, 10);
  const seed = (k: string) => `${today}_${range}_${k}`;
  const scale = range === '7d' ? 3.5 : range === '30d' ? 8 : 1;

  // ── Crypto bucket ──
  const cryptoReal = Object.keys(crypto).length > 0;
  const btcChg = crypto.bitcoin ?? noisy(seed('btc'), 1.2 * scale, 1.6);
  const ethChg = crypto.ethereum ?? btcChg * 0.9;
  const usdtChg = crypto.tether ?? noisy(seed('usdt'), 0, 0.05);
  const solChg = crypto.solana ?? btcChg * 1.4;

  // ── Metals bucket ──
  const metalsReal = goldChg != null || silverChg != null;
  const goldVal = goldChg ?? noisy(seed('gold'), 0.4 * scale, 0.8);
  const silverVal = silverChg ?? noisy(seed('silver'), 0.7 * scale, 1.2);

  // ── Stocks bucket ──
  const stocksReal = qqq != null || xle != null || iwm != null || xlf != null;
  const techChg = qqq ?? noisy(seed('tech'), 0.3 * scale + btcChg * 0.25, 1.2);
  const energyChg = xle ?? noisy(seed('energy'), 0.2 * scale + goldVal * 0.15, 1.0);
  const microCapChg = iwm ?? noisy(seed('microcap'), techChg * 0.6, 1.6);
  const financeChg = xlf ?? noisy(seed('finance'), 0.2 * scale, 0.9);

  // ── Bonds bucket ──
  const bondsReal = tlt != null || shy != null || lqd != null;
  const tBillsChg = shy ?? noisy(seed('tbills'), 0.05 * scale, 0.15);
  const longTreasChg = tlt ?? noisy(seed('tlt'), goldVal * 0.3 - btcChg * 0.1, 0.8);
  const corpChg = lqd ?? noisy(seed('lqd'), longTreasChg * 0.6, 0.4);

  // ── Cash bucket — use DXY as the proxy: rising DXY ≈ capital flowing into USD ──
  const cashReal = dxy != null;
  const dxyChg = dxy ?? noisy(seed('dxy'), -btcChg * 0.05 - goldVal * 0.1, 0.3);

  const sectors: Sector[] = [
    {
      id: 'metals',
      label: 'Precious Metals',
      sub: 'Gold + Silver',
      color: '#d4a843',
      chg: 0,
      mcap: 0,
      realData: metalsReal,
      children: [
        { id: 'gold',   label: 'Gold',   sub: 'XAU · Reserve Metal',  chg: goldVal,   mcap: 22.0, color: '#d4a843', parent: 'metals', icon: 'Au' },
        { id: 'silver', label: 'Silver', sub: 'XAG · Industrial',     chg: silverVal, mcap: 1.8,  color: '#c4cdd9', parent: 'metals', icon: 'Ag' },
      ],
    },
    {
      id: 'crypto',
      label: 'Crypto',
      sub: 'Digital Assets',
      color: '#f7931a',
      chg: 0,
      mcap: 0,
      realData: cryptoReal,
      children: [
        // Glyphs: ₿ (U+20BF), Ξ (U+039E), ₮ (U+20AE), ◎ (U+25CE) — single chars
        // that render reliably in DM Sans / Inter / system fallbacks.
        { id: 'btc',  label: 'Bitcoin',  sub: 'BTC · Digital Gold',    chg: btcChg,  mcap: 1.87, color: '#f7931a', parent: 'crypto', icon: '₿' },
        { id: 'eth',  label: 'Ethereum', sub: 'ETH · Smart Contracts', chg: ethChg,  mcap: 0.42, color: '#8b7fde', parent: 'crypto', icon: 'Ξ' },
        { id: 'usdt', label: 'Tether',   sub: 'USDT · Stablecoin',     chg: usdtChg, mcap: 0.13, color: '#26a17b', parent: 'crypto', icon: '₮' },
        { id: 'sol',  label: 'Solana',   sub: 'SOL · High-Speed L1',   chg: solChg,  mcap: 0.10, color: '#9945ff', parent: 'crypto', icon: '◎' },
      ],
    },
    {
      id: 'stocks',
      label: 'Stocks',
      sub: 'Equity Sectors',
      color: '#4a8fe8',
      chg: 0,
      mcap: 0,
      realData: stocksReal,
      children: [
        // ⚛ (U+269B atom), ⚡ (U+26A1 lightning), $ (USD), μ (U+03BC mu)
        { id: 'tech',     label: 'Tech',       sub: 'QQQ · Nasdaq-100',       chg: techChg,     mcap: 18.0, color: '#4a8fe8', parent: 'stocks', icon: '⚛' },
        { id: 'energy',   label: 'Energy',     sub: 'XLE · Oil & Gas',        chg: energyChg,   mcap: 4.2,  color: '#e09040', parent: 'stocks', icon: '⚡' },
        { id: 'finance',  label: 'Finance',    sub: 'XLF · Banks · Insurers', chg: financeChg,  mcap: 8.5,  color: '#7e9e6c', parent: 'stocks', icon: '$'      },
        { id: 'microcap', label: 'Micro-Caps', sub: 'IWM · Russell 2000',     chg: microCapChg, mcap: 2.1,  color: '#e06b8b', parent: 'stocks', icon: 'μ' },
      ],
    },
    {
      id: 'cash',
      label: 'Cash / Fiat',
      sub: 'USD & Money Market',
      color: '#70b8c8',
      chg: 0,
      mcap: 0,
      realData: cashReal,
      children: [
        { id: 'dxy', label: 'USD Index', sub: 'DXY · Dollar vs Basket', chg: dxyChg, mcap: 8.0, color: '#70b8c8', parent: 'cash', icon: '$' },
      ],
    },
    {
      id: 'bonds',
      label: 'Bonds',
      sub: 'Fixed Income',
      color: '#68a86a',
      chg: 0,
      mcap: 0,
      realData: bondsReal,
      children: [
        // T = T-Bill, ⊥ used as long-bond mark, ◈ corporate
        { id: 'tbills', label: 'T-Bills',         sub: 'SHY · 1-3yr Treasuries',  chg: tBillsChg,    mcap: 8.0,  color: '#88c88a', parent: 'bonds', icon: 'T' },
        { id: 'tlong',  label: 'Long Treasuries', sub: 'TLT · 20yr+',             chg: longTreasChg, mcap: 6.0,  color: '#4a8c4a', parent: 'bonds', icon: 'Σ' },
        { id: 'corp',   label: 'Corporates',      sub: 'LQD · Investment Grade',  chg: corpChg,      mcap: 12.0, color: '#68a86a', parent: 'bonds', icon: '◈' },
      ],
    },
  ];

  // Mcap-weighted aggregate per sector.
  for (const s of sectors) {
    const total = s.children.reduce((acc, c) => acc + c.mcap, 0);
    s.mcap = total;
    s.chg = total > 0 ? s.children.reduce((acc, c) => acc + c.chg * c.mcap, 0) / total : 0;
  }

  const sectorIndex = sectors.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {} as Record<SectorId, Sector>);

  return { sectors, sectorIndex, fetchedAt: Date.now() };
}

// ─── Flow construction ──────────────────────────────────────────────────

// Macro: curated pairs (full N×N would clutter the canvas).
const MACRO_PAIRS: Array<[SectorId, SectorId]> = [
  ['metals', 'crypto'],
  ['metals', 'stocks'],
  ['metals', 'bonds'],
  ['metals', 'cash'],
  ['crypto', 'stocks'],
  ['crypto', 'cash'],
  ['stocks', 'bonds'],
  ['stocks', 'cash'],
  ['bonds', 'cash'],
  ['bonds', 'crypto'],
];

export function buildSectorFlows(sectors: Sector[]): Flow[] {
  const flows: Flow[] = [];
  const lookup = sectors.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {} as Record<SectorId, Sector>);
  for (const [a, b] of MACRO_PAIRS) {
    const A = lookup[a], B = lookup[b];
    if (!A || !B) continue;
    const diff = (B.chg ?? 0) - (A.chg ?? 0);
    if (Math.abs(diff) < 0.02) continue;
    const strength = Math.min(3.5, Math.max(0.18, Math.abs(diff) * 0.45));
    flows.push({ from: a, to: b, strength, dir: diff >= 0 ? 1 : -1 });
  }
  return flows;
}

// Drill-down: full pairwise within sector children.
export function buildIntraFlows(children: AssetNode[]): Flow[] {
  const flows: Flow[] = [];
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const diff = children[j].chg - children[i].chg;
      if (Math.abs(diff) < 0.05) continue;
      const strength = Math.min(3.5, Math.max(0.2, Math.abs(diff) * 0.55));
      flows.push({
        from: children[i].id,
        to: children[j].id,
        strength,
        dir: diff >= 0 ? 1 : -1,
      });
    }
  }
  return flows;
}

// ─── Heuristic narrative (no AI dependency in MVP) ──────────────────────

export function buildNarrative(
  sectors: Sector[],
  flows: Flow[],
  range: Range,
  drillTarget: SectorId | null,
  drillNodes?: AssetNode[],
): string {
  const timeLabel =
    range === '24h'
      ? 'Over the past 24 hours'
      : range === '7d'
      ? 'Over the past week'
      : 'Over the past month';

  if (drillTarget && drillNodes && drillNodes.length) {
    const sec = sectors.find((s) => s.id === drillTarget);
    const sorted = [...drillNodes].sort((a, b) => b.chg - a.chg);
    const top = sorted[0];
    const bot = sorted[sorted.length - 1];
    const aggDir = (sec?.chg ?? 0) >= 0 ? 'gained' : 'lost';
    const spread = (top.chg - bot.chg).toFixed(2);
    const tail =
      sorted.length > 1
        ? `On a relative-momentum basis, capital is rotating from ${bot.label} into ${top.label}.`
        : '';
    return (
      `${timeLabel}, the ${sec?.label ?? drillTarget} bucket ${aggDir} ` +
      `${Math.abs(sec?.chg ?? 0).toFixed(2)}% on a market-cap-weighted basis. ` +
      `${top.label} led at ${top.chg >= 0 ? '+' : ''}${top.chg.toFixed(2)}%, ` +
      `${bot.label} lagged at ${bot.chg >= 0 ? '+' : ''}${bot.chg.toFixed(2)}% ` +
      `— a ${spread}-point spread. ${tail}`
    );
  }

  // Macro narrative.
  const sorted = [...sectors].sort((a, b) => b.chg - a.chg);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];
  const bigFlow = [...flows].sort((a, b) => b.strength - a.strength)[0];
  const bigSrc = bigFlow
    ? sectors.find((s) => s.id === (bigFlow.dir > 0 ? bigFlow.from : bigFlow.to))
    : null;
  const bigDst = bigFlow
    ? sectors.find((s) => s.id === (bigFlow.dir > 0 ? bigFlow.to : bigFlow.from))
    : null;
  const flowLine =
    bigSrc && bigDst
      ? `The dominant rotation signal is from ${bigSrc.label} into ${bigDst.label}.`
      : '';
  return (
    `${timeLabel}, ${winner.label} led the cross-asset board at ` +
    `${winner.chg >= 0 ? '+' : ''}${winner.chg.toFixed(2)}%, while ${loser.label} ` +
    `trailed at ${loser.chg >= 0 ? '+' : ''}${loser.chg.toFixed(2)}%. ${flowLine} ` +
    `Flow magnitudes track relative performance, not literal dollar transfers — ` +
    `they signal where capital is gravitating, not point-to-point movement.`
  );
}
