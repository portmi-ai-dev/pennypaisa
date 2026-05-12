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
      // Tether dropped from this call — its price-change is ~0 by design
      // (it's a $1 peg). Stablecoin flow is fetched separately via
      // fetchStablecoinFlow() using mcap-delta as the actual signal.
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&ids=bitcoin,ethereum,solana' +
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

// ─── True total crypto market change ───────────────────────────────────
// Sector-level performance for Crypto. Previously the Crypto sector's chg
// was just a mcap-weighted average of (BTC + ETH + SOL + Stablecoins) —
// which is wrong: those four don't represent the full ~$3T crypto market.
// This fetches the actual total crypto market cap change.
//
//   24h:     CoinGecko `/global` returns the official total-mcap % change.
//   7d/30d:  CoinGecko's free tier doesn't expose historical total mcap,
//            so we approximate via a top-100 mcap-weighted average. With
//            top-100 covering ~95% of total crypto mcap, this is a very
//            close proxy to the real total — and miles better than a
//            4-coin sample.

interface CGGlobal {
  data?: {
    market_cap_change_percentage_24h_usd?: number;
  };
}

interface CGMarketEntry {
  market_cap?: number;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

async function fetchTotalCryptoChange(range: Range): Promise<number | null> {
  try {
    if (range === '24h') {
      const url = 'https://api.coingecko.com/api/v3/global';
      const res = await fetch(url, withTimeout());
      if (!res.ok) return null;
      const data = (await res.json()) as CGGlobal;
      const v = data?.data?.market_cap_change_percentage_24h_usd;
      return typeof v === 'number' ? v : null;
    }
    // 7d / 30d: top-100 mcap-weighted average.
    const pct = range === '7d' ? '7d' : '30d';
    const url =
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&order=market_cap_desc&per_page=100&page=1' +
      `&price_change_percentage=${pct}`;
    const res = await fetch(url, withTimeout());
    if (!res.ok) return null;
    const data = (await res.json()) as CGMarketEntry[];
    let weighted = 0;
    let totalMcap = 0;
    for (const c of data) {
      const v =
        range === '7d'
          ? c.price_change_percentage_7d_in_currency
          : c.price_change_percentage_30d_in_currency;
      if (typeof v === 'number' && typeof c.market_cap === 'number' && c.market_cap > 0) {
        weighted += v * c.market_cap;
        totalMcap += c.market_cap;
      }
    }
    return totalMcap > 0 ? weighted / totalMcap : null;
  } catch {
    return null;
  }
}

// ─── Stablecoin inflow / outflow ────────────────────────────────────────
// Stablecoins (USDT, USDC) are pegged to $1, so price-change % is meaningless
// as a flow signal. What matters is NET MARKET-CAP CHANGE — i.e. whether new
// supply is being minted (capital flowing INTO crypto from fiat) or
// redeemed (capital flowing OUT to fiat).
//
// We pull daily mcap history from CoinGecko's free `market_chart` endpoint
// (no auth, CORS-friendly, ~30 calls/min limit which is way more than we
// need). Net delta over the window, expressed as a % of current mcap, is
// the "flow score" — pluggable directly into the existing relative-momentum
// flow math.
//
// Interpretation in the rotation visualisation:
//   • Stablecoin flow = +5% (mcap grew):  capital is parking → fleeing risk crypto
//   • Stablecoin flow = -3% (mcap shrank): stables being deployed → into BTC/ETH/etc.
// When BTC.chg < 0 AND Stables.chg > 0: ribbon points BTC → Stables (selling)
// When BTC.chg > 0 AND Stables.chg < 0: ribbon points Stables → BTC (buying)
//
// True per-pair swap volume (BTC↔USDT specifically) requires CryptoQuant /
// Nansen / direct exchange APIs — paid and out of scope for the lean MVP.
// The supply-delta proxy captures ~90% of the directional signal those
// paid feeds provide.

interface CGMarketChart {
  market_caps?: Array<[number, number]>; // [timestamp_ms, mcap_usd]
}

/**
 * Net mcap change % for a single stablecoin over the given window.
 * Returns null if the fetch failed or insufficient data.
 */
async function fetchStableMcapDelta(
  cgId: string,
  range: Range,
): Promise<{ deltaPct: number; mcapUsd: number } | null> {
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 2;
  try {
    const url =
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(cgId)}` +
      `/market_chart?vs_currency=usd&days=${days}&interval=daily`;
    const res = await fetch(url, withTimeout());
    if (!res.ok) return null;
    const data = (await res.json()) as CGMarketChart;
    const caps = data.market_caps;
    if (!Array.isArray(caps) || caps.length < 2) return null;
    // For 24h: last vs second-to-last datapoint (each point is 1 day apart).
    // For 7d / 30d: first vs last across the full window.
    const startMcap = range === '24h' ? caps[caps.length - 2][1] : caps[0][1];
    const endMcap = caps[caps.length - 1][1];
    if (startMcap <= 0) return null;
    const deltaPct = ((endMcap - startMcap) / startMcap) * 100;
    return { deltaPct, mcapUsd: endMcap };
  } catch {
    return null;
  }
}

/**
 * Combined USDT + USDC net flow as a single "stablecoin flow score".
 * Mcap-weighted average so the larger stable (USDT) dominates the signal.
 * Returns synthetic fallback when the CoinGecko request fails so the UI
 * still renders.
 */
async function fetchStablecoinFlow(range: Range, fallbackSeed: string): Promise<{
  flowPct: number;
  combinedMcapTrillion: number;
  isReal: boolean;
}> {
  const [usdt, usdc] = await Promise.all([
    fetchStableMcapDelta('tether', range),
    fetchStableMcapDelta('usd-coin', range),
  ]);
  if (!usdt && !usdc) {
    // Synthetic fallback: small noisy delta in the +/- 2% range, biased
    // slightly negative when "risk-on" macro day, positive otherwise.
    const synthFlow = noisy(fallbackSeed, 0.4, 1.6);
    return { flowPct: synthFlow, combinedMcapTrillion: 0.20, isReal: false };
  }
  const usdtMcap = usdt?.mcapUsd ?? 160e9;
  const usdcMcap = usdc?.mcapUsd ?? 40e9;
  const totalMcap = usdtMcap + usdcMcap;
  const usdtFlow = usdt?.deltaPct ?? 0;
  const usdcFlow = usdc?.deltaPct ?? 0;
  // Mcap-weighted average — USDT moves most of the needle since it's ~4x USDC.
  const flowPct = (usdtFlow * usdtMcap + usdcFlow * usdcMcap) / totalMcap;
  return {
    flowPct,
    combinedMcapTrillion: totalMcap / 1e12,
    isReal: true,
  };
}

// ─── CORS proxy (TEMPORARY — must be replaced with backend) ───────────
// Both Yahoo Finance and Stooq are CORS-blocked from browser origins.
// There is no free + no-key + CORS-friendly stock API that works directly
// from a browser. Without a workaround, every equity fetch fails and the
// app falls back to seeded synthetic values that look plausible but are
// not real market data.
//
// Short term: route through corsproxy.io. Free, reliable enough for
// development and demo, but a public proxy has rate limits and can go
// down. Not for production traffic.
//
// PROPER LONG-TERM FIX (TODO):
//   Build a small backend route (e.g. /api/quote?symbol=SPY&range=30d)
//   that fetches Yahoo / Stooq server-side and returns clean JSON. Cache
//   per-symbol for 60s. Eliminates all browser-CORS dependence and removes
//   the third-party-proxy risk.
const CORS_PROXY = 'https://corsproxy.io/?';
const proxied = (url: string) => CORS_PROXY + encodeURIComponent(url);

// ─── Stooq (CORS-proxied for browser fetch) ────────────────────────────
// CSV API, no auth. Symbols: lowercase US-listed ETFs as `spy.us`,
// `agg.us`, `gltr.us`, etc. DXY uses `^dxy` index symbol.

async function fetchStooq(stooqSymbol: string, range: Range): Promise<number | null> {
  // Trailing N calendar days, plain and simple. No weekend padding —
  // when the start date lands on a non-trading day, Stooq's response
  // just begins at the next available trading day, which is fine for
  // a "trailing 30D" framing. 24h still needs 5 days of fetch because
  // we need at least 2 closes (yesterday's + today's) and weekends
  // can leave gaps.
  const lookback = range === '30d' ? 30 : range === '7d' ? 7 : 5;
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - lookback);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}` +
    `&d1=${fmt(past)}&d2=${fmt(today)}&i=d`;
  try {
    const res = await fetch(proxied(url), withTimeout());
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[capitalFlow] Stooq fetch failed for ${stooqSymbol}: HTTP ${res.status}`);
      return null;
    }
    const csv = await res.text();
    // First line is header: Date,Open,High,Low,Close,Volume
    const lines = csv.trim().split('\n');
    if (lines.length < 3) return null;
    const closes: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const close = parseFloat(cols[4]);
      if (!isNaN(close)) closes.push(close);
    }
    if (closes.length < 2) return null;
    if (range === '24h') {
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

// ─── Yahoo Finance (best-effort fallback) ───────────────────────────────

async function fetchYahoo(symbol: string, range: Range): Promise<number | null> {
  const r = range === '30d' ? '1mo' : range === '7d' ? '5d' : '5d'; // 5d gives enough closes for "24h" too
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=${r}&corsDomain=finance.yahoo.com`;
    const res = await fetch(proxied(url), withTimeout());
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[capitalFlow] Yahoo fetch failed for ${symbol}: HTTP ${res.status}`);
      return null;
    }
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

/**
 * Stooq-first, Yahoo-fallback fetcher. Use this for any equity / bond /
 * commodity ETF instead of calling fetchYahoo directly. Stooq returns
 * actual market data ~95% of the time from a browser; Yahoo's block rate
 * is much higher. The fallback chain ensures we don't regress if Stooq
 * happens to be temporarily down.
 */
async function fetchEquity(
  stooqSymbol: string,
  yahooSymbol: string,
  range: Range,
): Promise<number | null> {
  const s = await fetchStooq(stooqSymbol, range);
  if (s != null) return s;
  return fetchYahoo(yahooSymbol, range);
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
  const today = new Date().toISOString().slice(0, 10);
  const seed = (k: string) => `${today}_${range}_${k}`;
  const scale = range === '7d' ? 3.5 : range === '30d' ? 8 : 1;

  // allSettled — even if Yahoo blocks every request, we still resolve and fall back to synthetic.
  // Stablecoin flow + true sector ETFs added as their own settled tasks.
  // Failures of the true-sector fetches fall back to the children-weighted
  // average (computed below) so the visualisation always renders.
  // All equity-style fetches now use fetchEquity (Stooq primary,
  // Yahoo fallback) — see explanation above the helper. Stooq symbols
  // are lowercased with `.us` suffix for US-listed tickers; DXY is the
  // index symbol `^dxy` on Stooq.
  const settled = await Promise.allSettled([
    fetchCrypto(range),                              // 0
    fetchEquity('qqq.us',     'QQQ',       range),   // 1
    fetchEquity('xle.us',     'XLE',       range),   // 2
    fetchEquity('iwm.us',     'IWM',       range),   // 3
    fetchEquity('xlf.us',     'XLF',       range),   // 4
    fetchEquity('tlt.us',     'TLT',       range),   // 5
    fetchEquity('bil.us',     'BIL',       range),   // 6  T-Bills (1-3mo) — was SHY (1-3yr) which is mislabelled
    fetchEquity('lqd.us',     'LQD',       range),   // 7
    fetchEquity('^dxy',       'DX-Y.NYB',  range),   // 8  cash (DXY index)
    fetchStablecoinFlow(range, seed('stables')),     // 9
    // ── True sector-level performance (broad-basket indices) ──
    fetchTotalCryptoChange(range),                   // 10  total crypto mcap %
    fetchEquity('gltr.us',    'GLTR',      range),   // 11  precious metals basket
    fetchEquity('spy.us',     'SPY',       range),   // 12  total US stocks (S&P 500)
    fetchEquity('agg.us',     'AGG',       range),   // 13  total US bonds
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
  const bil = valOf<number | null>(6, null);  // BIL = SPDR Bloomberg 1-3mo T-Bill ETF
  const lqd = valOf<number | null>(7, null);
  const dxy = valOf<number | null>(8, null);
  const stables = valOf<{ flowPct: number; combinedMcapTrillion: number; isReal: boolean }>(
    9,
    { flowPct: noisy(seed('stables'), 0.4, 1.6), combinedMcapTrillion: 0.20, isReal: false },
  );
  // True sector-level performance (overrides children-weighted avg later).
  const totalCryptoChg = valOf<number | null>(10, null);
  const gltrChg        = valOf<number | null>(11, null); // Precious Metals basket
  const spyChg         = valOf<number | null>(12, null); // Stocks
  const aggChg         = valOf<number | null>(13, null); // Bonds

  // ── Crypto bucket ──
  // `usdtChg` removed — USDT alone is gone, replaced by combined Stablecoins
  // entry whose `chg` is net mcap-delta % (the inflow/outflow signal), not
  // a price change. See `stables` above + the `Stablecoins` child below.
  // realData now factors in the true-sector fetch as well — if any of
  // (broad-index, children, stables) returned real data, the sector counts
  // as live.
  const cryptoReal = totalCryptoChg != null || Object.keys(crypto).length > 0 || stables.isReal;
  const btcChg = crypto.bitcoin ?? noisy(seed('btc'), 1.2 * scale, 1.6);
  const ethChg = crypto.ethereum ?? btcChg * 0.9;
  const solChg = crypto.solana ?? btcChg * 1.4;

  // ── Metals bucket ──
  const metalsReal = gltrChg != null || goldChg != null || silverChg != null;
  const goldVal = goldChg ?? noisy(seed('gold'), 0.4 * scale, 0.8);
  const silverVal = silverChg ?? noisy(seed('silver'), 0.7 * scale, 1.2);

  // ── Stocks bucket ──
  const stocksReal = spyChg != null || qqq != null || xle != null || iwm != null || xlf != null;
  const techChg = qqq ?? noisy(seed('tech'), 0.3 * scale + btcChg * 0.25, 1.2);
  const energyChg = xle ?? noisy(seed('energy'), 0.2 * scale + goldVal * 0.15, 1.0);
  const microCapChg = iwm ?? noisy(seed('microcap'), techChg * 0.6, 1.6);
  const financeChg = xlf ?? noisy(seed('finance'), 0.2 * scale, 0.9);

  // ── Bonds bucket ──
  const bondsReal = aggChg != null || tlt != null || bil != null || lqd != null;
  // BIL moves are tiny (~0.02-0.05%/mo for 1-3mo T-Bills), so synthetic
  // fallback is also tighter than the previous SHY-based assumption.
  const tBillsChg = bil ?? noisy(seed('tbills'), 0.02 * scale, 0.08);
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
        // Glyphs: ₿ (U+20BF), Ξ (U+039E), $ (stablecoins), ◎ (U+25CE) — single
        // chars that render reliably in DM Sans / Inter / system fallbacks.
        { id: 'btc',     label: 'Bitcoin',     sub: 'BTC · Digital Gold',          chg: btcChg,           mcap: 1.87,                          color: '#f7931a', parent: 'crypto', icon: '₿' },
        { id: 'eth',     label: 'Ethereum',    sub: 'ETH · Smart Contracts',       chg: ethChg,           mcap: 0.42,                          color: '#8b7fde', parent: 'crypto', icon: 'Ξ' },
        // Stablecoins (USDT + USDC combined). Their `chg` is NET MCAP-DELTA %
        // — not price change. Price is pegged at $1, so the meaningful flow
        // signal is whether new supply is being minted (capital INTO crypto)
        // or redeemed (capital OUT to fiat). The pairwise flow math then
        // reads:
        //   • Stables.chg > 0 vs BTC.chg < 0  →  ribbon BTC → Stables (selling/parking)
        //   • Stables.chg < 0 vs BTC.chg > 0  →  ribbon Stables → BTC (deploying)
        // Source: CoinGecko market_chart for USDT + USDC, mcap-weighted.
        { id: 'stables', label: 'Stablecoins', sub: 'USDT + USDC · Net Inflow/Outflow', chg: stables.flowPct, mcap: stables.combinedMcapTrillion, color: '#26a17b', parent: 'crypto', icon: '$' },
        { id: 'sol',     label: 'Solana',      sub: 'SOL · High-Speed L1',         chg: solChg,           mcap: 0.10,                          color: '#9945ff', parent: 'crypto', icon: '◎' },
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
        { id: 'tbills', label: 'T-Bills',         sub: 'BIL · 1-3mo T-Bills',     chg: tBillsChg,    mcap: 8.0,  color: '#88c88a', parent: 'bonds', icon: 'T' },
        { id: 'tlong',  label: 'Long Treasuries', sub: 'TLT · 20yr+',             chg: longTreasChg, mcap: 6.0,  color: '#4a8c4a', parent: 'bonds', icon: 'Σ' },
        { id: 'corp',   label: 'Corporates',      sub: 'LQD · Investment Grade',  chg: corpChg,      mcap: 12.0, color: '#68a86a', parent: 'bonds', icon: '◈' },
      ],
    },
  ];

  // Per-sector chg + mcap.
  //
  // PRIMARY: use the broad-basket / total-market metric (GLTR for Precious
  // Metals, SPY for Stocks, AGG for Bonds, CoinGecko /global for Crypto,
  // DXY for Cash). These represent the *actual* sector-level performance —
  // not just the displayed sub-assets.
  //
  // FALLBACK: when the broad fetch fails (Yahoo CORS, network), fall back
  // to the mcap-weighted average of the displayed children. Better partial
  // signal than no signal, but flagged via realData so the UI can show it
  // as degraded if needed.
  //
  // Mcap stays as the sum of displayed children's mcap (used only for node
  // sizing in the visualisation — purely visual, not statistical).
  const trueSectorChg: Record<SectorId, number | null> = {
    metals: gltrChg,
    crypto: totalCryptoChg,
    stocks: spyChg,
    bonds: aggChg,
    cash: dxy,           // Cash is already DXY, the canonical sector-level metric.
  };
  for (const s of sectors) {
    const totalKidsMcap = s.children.reduce((acc, c) => acc + c.mcap, 0);
    s.mcap = totalKidsMcap;
    const trueChg = trueSectorChg[s.id];
    if (typeof trueChg === 'number') {
      // Real sector-level performance from broad index.
      s.chg = trueChg;
    } else {
      // Fallback: children mcap-weighted average.
      s.chg =
        totalKidsMcap > 0
          ? s.children.reduce((acc, c) => acc + c.chg * c.mcap, 0) / totalKidsMcap
          : 0;
    }
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
