// CapitalFlowPage — Lean MVP of the Capital Rotation tab.
//
// Visualisation:
//   - Five sector "planets" laid out in a pentagon (Cash on top, Metals/Crypto
//     on the upper diagonals, Bonds/Stocks on the bottom diagonals).
//   - Flows between them rendered as TAPERED RIBBONS — wide at the source,
//     narrowing to a bold arrowhead at the destination, with a magnitude
//     label pill on the curve. Direction and size are obvious at a glance.
//   - A travelling bright highlight glides along each ribbon, replacing the
//     particle confetti from the earlier draft.
//
// Interaction:
//   - Click a sector → it EXPANDS in place. Children orbit inside the parent
//     circle (Tech / Energy / Finance / Micro-Caps inside Stocks, etc.).
//     Inter-sector ribbons re-route to the new outer edge; intra-sector
//     ribbons appear between the children.
//   - Click again to collapse. Only one sector expanded at a time keeps the
//     canvas readable.
//   - The "Drill into" button is gone; the sector IS the drill control.

import * as React from 'react';
import {
  fetchFlowData,
  buildSectorFlows,
  buildIntraFlows,
  buildNarrative,
  type FlowData,
  type Flow,
  type AssetNode,
  type Sector,
  type SectorId,
  type Range,
} from '../lib/capitalFlowData';
import type { Prices } from '../lib/marketData';
import { CRYPTO_LOGOS } from '../lib/cryptoLogos';

// ─── Layout ────────────────────────────────────────────────────────────

interface NodePos {
  id: string;
  label: string;
  sub?: string;
  chg: number;
  mcap: number;
  color: string;
  parent?: SectorId;        // present on child nodes
  isMetalsParent?: boolean; // sector node uses metallic gradient
  icon?: string;            // single-glyph icon for child bubbles
  x: number;                // 0..1 normalized
  y: number;                // 0..1 normalized
  baseR: number;            // px radius at nominal canvas width
}

// Pentagon for the 5 macro sectors.
const SECTOR_POS: Record<SectorId, { x: number; y: number }> = {
  cash:   { x: 0.50, y: 0.18 },
  metals: { x: 0.20, y: 0.42 },
  crypto: { x: 0.80, y: 0.42 },
  bonds:  { x: 0.30, y: 0.80 },
  stocks: { x: 0.70, y: 0.80 },
};

// Per-sector base radius — log-scaled by sector mcap, hand-tuned for legibility.
function sectorBaseR(s: Sector, W: number): number {
  const base = Math.log10((s.mcap || 1) + 1) * 22;
  return Math.max(48, Math.min(78, base + 32)) * (W / 1000);
}

// Child positions are computed *each frame* relative to the parent's animated
// centre and current expansion radius, so a child orbiting from the parent's
// position out to its final orbit slot is just a lerp of `expansion` t→1.
function childOrbitAngles(n: number): number[] {
  if (n === 1) return [0];
  if (n === 2) return [Math.PI, 0]; // left, right
  if (n === 3) return [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  if (n === 4) return [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25, Math.PI * 0.75];
  return Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);
}

// ─── Tapered ribbon arrow ──────────────────────────────────────────────
// Builds a Bézier curve between two anchor points (already offset to lie on
// the source/destination circle perimeters) and renders it as a quadrilateral
// strip whose width tapers from `widthSrc` at t=0 to a hairline at t=1, with
// a separate filled triangle as the arrowhead.

interface RibbonOpts {
  x1: number; y1: number;
  x2: number; y2: number;
  widthSrc: number;             // ribbon width at source
  colorSrc: string;             // hex
  colorDst: string;             // hex
  alpha: number;                // 0..1 master alpha
  flowPhase: number;            // 0..1, position of the travelling highlight
  label?: string;               // optional pill label centred on the curve
}

function drawRibbon(ctx: CanvasRenderingContext2D, o: RibbonOpts) {
  const { x1, y1, x2, y2, widthSrc, colorSrc, colorDst, alpha, flowPhase, label } = o;
  // Quadratic Bézier control point — perpendicular offset for a gentle arc.
  const cpx = (x1 + x2) / 2 + (y2 - y1) * 0.16;
  const cpy = (y1 + y2) / 2 - (x2 - x1) * 0.16;

  // Sample the curve.
  const SEG = 28;
  type S = { x: number; y: number; tx: number; ty: number };
  const samples: S[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const u = 1 - t;
    const x = u * u * x1 + 2 * u * t * cpx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * cpy + t * t * y2;
    // Tangent (derivative of the Bézier).
    const tx = 2 * u * (cpx - x1) + 2 * t * (x2 - cpx);
    const ty = 2 * u * (cpy - y1) + 2 * t * (y2 - cpy);
    samples.push({ x, y, tx, ty });
  }

  // Build tapered polygon (top edge then bottom edge in reverse).
  // Tip stops a bit short of x2,y2 to leave room for the arrowhead.
  const headBackT = 0.86; // ribbon tip ends at t ≈ 0.86
  const headSampleIdx = Math.round(SEG * headBackT);

  const pts: Array<{ x: number; y: number }> = [];
  const mirror: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= headSampleIdx; i++) {
    const s = samples[i];
    const len = Math.hypot(s.tx, s.ty) || 1;
    const nx = -s.ty / len;
    const ny = s.tx / len;
    const t = i / SEG;
    // Width tapers: 1 at source → 0.15 just before arrowhead.
    const wFactor = (1 - t / headBackT) * 0.85 + 0.15;
    const halfW = (widthSrc / 2) * wFactor;
    pts.push({ x: s.x + nx * halfW, y: s.y + ny * halfW });
    mirror.push({ x: s.x - nx * halfW, y: s.y - ny * halfW });
  }

  // ── Outer glow (drawn first, fatter, very translucent) ──
  ctx.save();
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = colorDst;
  ctx.shadowColor = colorDst;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  for (let i = mirror.length - 1; i >= 0; i--) ctx.lineTo(mirror[i].x, mirror[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Main ribbon with linear gradient (source → destination color) ──
  const grd = ctx.createLinearGradient(x1, y1, x2, y2);
  grd.addColorStop(0, colorSrc + 'cc');
  grd.addColorStop(1, colorDst + 'ff');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  for (let i = mirror.length - 1; i >= 0; i--) ctx.lineTo(mirror[i].x, mirror[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Arrowhead (filled triangle pointing along the tangent at headSample) ──
  const head = samples[headSampleIdx];
  const headAng = Math.atan2(head.ty, head.tx);
  // Place the tip exactly at the destination (x2,y2) — looks crisper than the
  // raw sample point for short arrows.
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colorDst;
  ctx.shadowColor = colorDst;
  ctx.shadowBlur = 6;
  ctx.translate(x2, y2);
  ctx.rotate(headAng);
  const headLen = Math.max(10, widthSrc * 1.4);
  const headHalf = Math.max(6, widthSrc * 0.85);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-headLen, headHalf);
  ctx.lineTo(-headLen * 0.65, 0);
  ctx.lineTo(-headLen, -headHalf);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Travelling highlight (a single bright wave gliding along the ribbon) ──
  // Renders as a brighter mini-strip from phase to phase + window.
  const window = 0.16;
  const start = flowPhase;
  const end = Math.min(headBackT, flowPhase + window);
  if (start < headBackT) {
    const i0 = Math.max(0, Math.floor((start / 1) * SEG));
    const i1 = Math.min(headSampleIdx, Math.ceil((end / 1) * SEG));
    if (i1 > i0) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      // Top edge
      ctx.moveTo(pts[i0].x, pts[i0].y);
      for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
      // Bottom edge in reverse
      for (let i = i1; i >= i0; i--) {
        // Use a slightly skinnier mirror so the highlight reads as a wave on top.
        const mx = mirror[i].x * 0.5 + pts[i].x * 0.5;
        const my = mirror[i].y * 0.5 + pts[i].y * 0.5;
        ctx.lineTo(mx, my);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Magnitude label pill at midpoint ──
  if (label) {
    const mid = samples[Math.round(SEG * 0.5)];
    const padX = 7;
    const padY = 3;
    ctx.save();
    ctx.font = '600 10px DM Sans, sans-serif';
    const tw = ctx.measureText(label).width;
    const bw = tw + padX * 2;
    const bh = 14 + padY * 0;
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = 'rgba(8,8,16,0.92)';
    ctx.strokeStyle = colorDst + 'aa';
    ctx.lineWidth = 1;
    const bx = mid.x - bw / 2;
    const by = mid.y - bh / 2;
    // Rounded rect fallback (Path2D roundRect not in older browsers).
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colorDst;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mid.x, mid.y + 0.5);
    ctx.restore();
  }
}

// Computes anchor points where a flow line meets the perimeter of source &
// destination circles, so ribbons start/end *on the edge* not the centre.
function edgeAnchor(cx: number, cy: number, r: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
}

// ─── Component ─────────────────────────────────────────────────────────

interface Props {
  prices: Prices | null;
}

const RANGE_LABELS: Record<Range, string> = { '24h': '24H', '7d': '7D', '30d': '30D' };

export const CapitalFlowPage: React.FC<Props> = ({ prices }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const scrollWrapRef = React.useRef<HTMLDivElement | null>(null);
  // Tracked separately from the canvas so we can compute a *required* canvas
  // height (which may exceed the wrapper height when an edge-pentagon sector
  // is expanded). The wrapper is overflow:auto so it scrolls in that case.
  const [wrapW, setWrapW] = React.useState(0);
  const [wrapH, setWrapH] = React.useState(0);
  const stateRef = React.useRef<{
    sectors: Sector[];
    sectorFlows: Flow[];
    selected: string | null;
    hovered: string | null;
    expanded: SectorId | null;
    expansion: Record<SectorId, number>; // 0..1 animated
    flowPhase: Record<string, number>;   // per-flow 0..1 highlight position
  }>({
    sectors: [],
    sectorFlows: [],
    selected: null,
    hovered: null,
    expanded: null,
    expansion: { metals: 0, crypto: 0, stocks: 0, cash: 0, bonds: 0 },
    flowPhase: {},
  });
  const frameRef = React.useRef<number | null>(null);

  const [range, setRange] = React.useState<Range>('24h');
  const [data, setData] = React.useState<FlowData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<SectorId | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tickerPos, setTickerPos] = React.useState(0);
  const [methodOpen, setMethodOpen] = React.useState(false);

  // Pre-load crypto brand logos as HTMLImageElements once on mount. Stored in
  // a ref (not state) because the canvas renders directly on rAF — re-renders
  // aren't needed when the images finish decoding; the next frame just picks
  // them up via `img.complete`.
  const logosRef = React.useRef<Record<string, HTMLImageElement>>({});
  React.useEffect(() => {
    for (const [id, src] of Object.entries(CRYPTO_LOGOS)) {
      const img = new Image();
      img.src = src;
      logosRef.current[id] = img;
    }
  }, []);

  // Observe the scroll wrapper so we know how much room the canvas *would*
  // get if no scrolling were needed. Drives the dynamic canvas height memo.
  React.useEffect(() => {
    const el = scrollWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setWrapW(r.width);
      setWrapH(r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dynamic canvas height. When a top/bottom sector (cash/bonds/stocks) is
  // expanded its bubble can extend beyond the visible wrapper, so we grow the
  // canvas height enough to fit (radius + chip + header padding) and let the
  // wrapper scroll. Middle sectors keep canvas == wrapper height.
  //
  // The radius math here MUST match the EXPANDED_TARGET formula inside
  // `computePositions` (cap 240, halved for single-child sectors) — otherwise
  // the wrapper grows to a different size than the bubble actually drawn,
  // leaving either dead scroll space or clipped content.
  const canvasH = React.useMemo(() => {
    if (!expanded || wrapW === 0 || wrapH === 0 || !data) return wrapH;
    const sec = data.sectorIndex[expanded];
    const childCount = sec?.children.length ?? 4;
    const ectScale = childCount === 1 ? 0.5 : 1.0;
    const r = Math.min(180 * (wrapW / 1000), 240) * ectScale;
    const home = SECTOR_POS[expanded];
    const CHIP_PAD = 30;   // status chip above bubble
    const HEADER_PAD = 45; // "CRYPTO · -0.12%" header below bubble
    // Required canvas height so home.y * H >= r + CHIP_PAD AND
    // (1 - home.y) * H >= r + HEADER_PAD.
    const needTop = (r + CHIP_PAD) / home.y;
    const needBot = (r + HEADER_PAD) / (1 - home.y);
    return Math.max(wrapH, Math.ceil(Math.max(needTop, needBot)));
  }, [expanded, wrapW, wrapH, data]);

  // Auto-scroll the expanded sector into the visible wrapper area. When
  // collapsed, scroll back to top so the next interaction starts clean.
  React.useEffect(() => {
    const el = scrollWrapRef.current;
    if (!el) return;
    if (!expanded) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Defer one frame so the canvas has finished resizing.
    const id = requestAnimationFrame(() => {
      const home = SECTOR_POS[expanded];
      const sectorPx = home.y * canvasH;
      const target = Math.max(0, sectorPx - wrapH / 2);
      el.scrollTo({ top: target, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [expanded, canvasH, wrapH]);

  // ── Stable primitives so we don't re-fetch every poll of the App-level prices ──
  const goldChg = prices?.gold?.changePercent24h;
  const silverChg = prices?.silver?.changePercent24h;

  // ── Fetch on range / metals-change ──
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    fetchFlowData({ range, goldChg, silverChg })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, goldChg, silverChg]);

  // ── Build derived data ──
  const sectorFlows = React.useMemo(() => (data ? buildSectorFlows(data.sectors) : []), [data]);
  const intraFlows = React.useMemo(() => {
    if (!data || !expanded) return [] as Flow[];
    const sec = data.sectorIndex[expanded];
    return sec ? buildIntraFlows(sec.children) : [];
  }, [data, expanded]);
  const narrativeText = React.useMemo(() => {
    if (!data) return '';
    if (expanded) {
      const sec = data.sectorIndex[expanded];
      return buildNarrative(data.sectors, intraFlows, range, expanded, sec?.children);
    }
    return buildNarrative(data.sectors, sectorFlows, range, null);
  }, [data, expanded, intraFlows, sectorFlows, range]);

  // ── Top movers across all nodes ──
  const topMovers = React.useMemo(() => {
    if (!data) return [] as Array<{ id: string; label: string; chg: number; color: string }>;
    const all: Array<{ id: string; label: string; chg: number; color: string }> = [];
    for (const s of data.sectors) {
      for (const c of s.children) {
        all.push({ id: c.id, label: c.label, chg: c.chg, color: c.color });
      }
    }
    return all.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 10);
  }, [data]);

  // ── Selected node panel data — flows touching the selection ──
  const allFlowsForPanel = React.useMemo(() => {
    return [...sectorFlows, ...intraFlows];
  }, [sectorFlows, intraFlows]);

  // ── Sidebar list — sectors when collapsed, sector children when expanded ──
  const sidebarNodes = React.useMemo(() => {
    if (!data) return [] as Array<{ id: string; label: string; sub?: string; chg: number; color: string }>;
    if (expanded) {
      const sec = data.sectorIndex[expanded];
      return sec ? sec.children.map((c) => ({ id: c.id, label: c.label, sub: c.sub, chg: c.chg, color: c.color })) : [];
    }
    return data.sectors.map((s) => ({ id: s.id, label: s.label, sub: s.sub, chg: s.chg, color: s.color }));
  }, [data, expanded]);

  // ── Ticker scroll ──
  React.useEffect(() => {
    const id = window.setInterval(() => setTickerPos((p) => p - 1), 28);
    return () => window.clearInterval(id);
  }, []);

  // ── Sync state ref ──
  React.useEffect(() => {
    stateRef.current.sectors = data?.sectors ?? [];
    stateRef.current.sectorFlows = sectorFlows;
    // Initialize phase for any new flows.
    const phases = stateRef.current.flowPhase;
    for (const f of [...sectorFlows, ...intraFlows]) {
      const key = `${f.from}|${f.to}`;
      if (phases[key] == null) phases[key] = Math.random();
    }
  }, [data, sectorFlows, intraFlows]);
  React.useEffect(() => {
    stateRef.current.expanded = expanded;
  }, [expanded]);
  React.useEffect(() => {
    stateRef.current.selected = selected;
  }, [selected]);

  // ── Canvas event handlers + draw loop ──
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

    // Helper: snapshot current node positions + radii given current expansion state.
    //
    // Sizing model (new):
    //   • All sectors lerp toward a *uniform* expanded target so an expanded
    //     Crypto reads as visually equal to an expanded Metals — the focus is
    //     on the bucket's contents, not its mcap. Collapsed sizes still vary
    //     by mcap (so the macro view feels weighted).
    //   • Child radius is count-aware: a 2-child sector (Metals) gets fat
    //     children, a 4-child sector (Crypto / Stocks) gets smaller ones —
    //     keeps inter-child gaps roughly constant regardless of count.
    const computePositions = (W: number, H: number): {
      sectorNodes: NodePos[];
      childNodes: NodePos[];
    } => {
      const out: NodePos[] = [];
      const kids: NodePos[] = [];
      // Target radius an expanded sector grows toward. Capped at 240 px so
      // the bubble never feels grotesque on wide monitors, and *halved* for
      // single-child sectors (Cash/DXY) — they only have one inner asset to
      // show, so a 540-px-wide bubble was overkill. When the resulting
      // bubble still overflows the viewport at its pentagon home, the
      // wrapping <div> scrolls (see `scrollWrapRef`).
      for (const s of stateRef.current.sectors) {
        const pos = SECTOR_POS[s.id];
        const baseR = sectorBaseR(s, W);
        const ectScale = s.children.length === 1 ? 0.5 : 1.0;
        const EXPANDED_TARGET = Math.min(180 * (W / 1000), 240) * ectScale;
        const exp = stateRef.current.expansion[s.id] || 0;
        // Linear lerp baseR → EXPANDED_TARGET (clamped so we never *shrink*).
        const r = baseR + Math.max(0, EXPANDED_TARGET - baseR) * exp;
        out.push({
          id: s.id,
          label: s.label,
          sub: s.sub,
          chg: s.chg,
          mcap: s.mcap,
          color: s.color,
          isMetalsParent: s.id === 'metals',
          x: pos.x,
          y: pos.y,
          baseR: r,
        });
        if (exp > 0.02) {
          const childCount = s.children.length;
          // Count-aware child radius: fewer children → bigger bubbles.
          const childMul =
            childCount === 1 ? 0.55 :
            childCount === 2 ? 0.42 :
            childCount === 3 ? 0.30 :
            0.24;
          const orbitR = childCount === 1 ? 0 : r * 0.55;
          const childR = r * childMul * exp; // grows-in with parent expansion
          const angles = childOrbitAngles(childCount);
          for (let i = 0; i < childCount; i++) {
            const c = s.children[i];
            const ang = angles[i];
            const cx = pos.x * W + Math.cos(ang) * orbitR * exp;
            const cy = pos.y * H + Math.sin(ang) * orbitR * exp;
            kids.push({
              id: c.id,
              label: c.label,
              sub: c.sub,
              chg: c.chg,
              mcap: c.mcap,
              color: c.color,
              parent: s.id,
              icon: c.icon,
              x: cx / W,
              y: cy / H,
              baseR: childR,
            });
          }
        }
      }
      return { sectorNodes: out, childNodes: kids };
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const { sectorNodes, childNodes } = computePositions(W, H);
      let hit: string | null = null;
      // Children take priority (they sit on top of expanded parent).
      for (const n of childNodes) {
        if (Math.hypot(mx - n.x * W, my - n.y * H) < n.baseR + 6) {
          hit = n.id;
          break;
        }
      }
      if (!hit) {
        for (const n of sectorNodes) {
          if (Math.hypot(mx - n.x * W, my - n.y * H) < n.baseR + 6) {
            hit = n.id;
            break;
          }
        }
      }
      stateRef.current.hovered = hit;
      canvas.style.cursor = hit ? 'pointer' : 'default';
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const { sectorNodes, childNodes } = computePositions(W, H);
      // Children first.
      for (const n of childNodes) {
        if (Math.hypot(mx - n.x * W, my - n.y * H) < n.baseR + 6) {
          setSelected((p) => (p === n.id ? null : n.id));
          return;
        }
      }
      // Then sectors — click toggles expansion AND opens the side panel
      // for that sector so the user sees its inflows/outflows immediately.
      for (const n of sectorNodes) {
        if (Math.hypot(mx - n.x * W, my - n.y * H) < n.baseR + 6) {
          const sid = n.id as SectorId;
          setExpanded((cur) => (cur === sid ? null : sid));
          setSelected((cur) => (cur === sid ? null : sid));
          return;
        }
      }
      // Empty area: collapse + deselect.
      setExpanded(null);
      setSelected(null);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);

    let lastT = performance.now();
    const draw = (now: number) => {
      frameRef.current = requestAnimationFrame(draw);
      const dt = Math.min(64, now - lastT) / 1000; // seconds, capped
      lastT = now;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (!W || !H || stateRef.current.sectors.length === 0) {
        ctx.clearRect(0, 0, W, H);
        return;
      }

      // Animate expansion.
      const target = stateRef.current.expanded;
      for (const sid of ['metals', 'crypto', 'stocks', 'cash', 'bonds'] as SectorId[]) {
        const cur = stateRef.current.expansion[sid] || 0;
        const tgt = target === sid ? 1 : 0;
        const speed = 4.5; // exp(-speed*dt) easing
        const next = cur + (tgt - cur) * Math.min(1, speed * dt);
        stateRef.current.expansion[sid] = next;
      }

      // Animate flow phases.
      const allFlows = [
        ...stateRef.current.sectorFlows,
        ...intraFlows, // captured from React closure — fine, refs to stable per-render arrays
      ];
      for (const f of allFlows) {
        const key = `${f.from}|${f.to}`;
        let p = stateRef.current.flowPhase[key];
        if (p == null) p = Math.random();
        const speed = 0.18 + Math.min(0.4, f.strength * 0.12);
        p += dt * speed;
        if (p > 1) p -= 1;
        stateRef.current.flowPhase[key] = p;
      }

      ctx.clearRect(0, 0, W, H);

      // Subtle background grid + radial vignette for ambience.
      const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0, 'rgba(20,20,40,0.35)');
      bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      const { sectorNodes, childNodes } = computePositions(W, H);
      const sel = stateRef.current.selected;
      const hov = stateRef.current.hovered;

      // ── DRAW INTER-SECTOR FLOWS (from sector edge to sector edge) ──
      for (const f of stateRef.current.sectorFlows) {
        const from = sectorNodes.find((n) => n.id === (f.dir > 0 ? f.from : f.to));
        const to = sectorNodes.find((n) => n.id === (f.dir > 0 ? f.to : f.from));
        if (!from || !to) continue;
        const fx = from.x * W;
        const fy = from.y * H;
        const tx = to.x * W;
        const ty = to.y * H;
        const a = edgeAnchor(fx, fy, from.baseR + 3, tx, ty);
        const b = edgeAnchor(tx, ty, to.baseR + 6, fx, fy);
        const isHl = sel ? f.from === sel || f.to === sel : true;
        const phase = stateRef.current.flowPhase[`${f.from}|${f.to}`] || 0;
        const widthSrc = 4 + Math.min(28, f.strength * 9);
        const fromSec = stateRef.current.sectors.find((s) => s.id === from.id);
        const toSec = stateRef.current.sectors.find((s) => s.id === to.id);
        const diff = (toSec?.chg ?? 0) - (fromSec?.chg ?? 0);
        const labelStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`;
        drawRibbon(ctx, {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          widthSrc,
          colorSrc: from.color,
          colorDst: to.color,
          alpha: isHl ? 1 : 0.18,
          flowPhase: phase,
          label: isHl ? labelStr : undefined,
        });
      }

      // ── DRAW INTRA-SECTOR FLOWS (only when sector is expanded > threshold) ──
      for (const f of intraFlows) {
        const from = childNodes.find((n) => n.id === (f.dir > 0 ? f.from : f.to));
        const to = childNodes.find((n) => n.id === (f.dir > 0 ? f.to : f.from));
        if (!from || !to) continue;
        const exp = stateRef.current.expansion[from.parent || 'cash'] || 0;
        if (exp < 0.3) continue;
        const fx = from.x * W;
        const fy = from.y * H;
        const tx = to.x * W;
        const ty = to.y * H;
        const a = edgeAnchor(fx, fy, from.baseR + 2, tx, ty);
        const b = edgeAnchor(tx, ty, to.baseR + 4, fx, fy);
        const phase = stateRef.current.flowPhase[`${f.from}|${f.to}`] || 0;
        const widthSrc = 3 + Math.min(14, f.strength * 7);
        // Use the actual child node chg for the diff label.
        const fromCh = stateRef.current.sectors.flatMap((s) => s.children).find((c) => c.id === from.id);
        const toCh = stateRef.current.sectors.flatMap((s) => s.children).find((c) => c.id === to.id);
        const diff = (toCh?.chg ?? 0) - (fromCh?.chg ?? 0);
        // Intra flows are bright by default whenever the parent sector is
        // expanded — that's the whole point of expanding. Selecting a
        // specific child bumps brightness on its incident ribbons; selecting
        // the parent sector (which happens automatically on expand) does NOT
        // dim them like it used to. Labels still stay hover/select-only so
        // the canvas doesn't flood with text.
        const childInvolved =
          sel === f.from || sel === f.to || hov === f.from || hov === f.to;
        drawRibbon(ctx, {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          widthSrc,
          colorSrc: from.color,
          colorDst: to.color,
          alpha: (childInvolved ? 1 : 0.85) * exp,
          flowPhase: phase,
          label: childInvolved && exp > 0.85 ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%` : undefined,
        });
      }

      // ── Net inflow/outflow accounting per node ──
      // Sums incoming flow strengths minus outgoing flow strengths so each node
      // gets a single signed score. Positive ⇒ capital is gravitating toward
      // this node on a relative-momentum basis; negative ⇒ leaving it.
      const netForNode = (id: string, flowSet: Flow[]): number => {
        let inSum = 0;
        let outSum = 0;
        for (const f of flowSet) {
          // Direction is encoded as: dir=+1 means f.from→f.to, dir=-1 means
          // f.to→f.from. So the *destination* is whichever side `dir` points to.
          const dst = f.dir > 0 ? f.to : f.from;
          const src = f.dir > 0 ? f.from : f.to;
          if (dst === id) inSum += f.strength;
          if (src === id) outSum += f.strength;
        }
        return inSum - outSum;
      };

      // Threshold tuned so most sectors land on a definite side; ties (~|net|<0.4)
      // get the BALANCED label so we never lie about ambiguous flow.
      const statusFor = (net: number): { label: string; col: string } => {
        if (net > 0.45) return { label: 'RECEIVING', col: '#4caf50' };
        if (net < -0.45) return { label: 'OUTFLOW',   col: '#ef5350' };
        return { label: 'BALANCED', col: '#7c8597' };
      };

      // Rounded-rect chip helper (Path2D.roundRect isn't safe across all targets).
      // `scale` shrinks the whole chip — used for child bubbles so the chip
      // doesn't dominate the smaller circle.
      const drawChip = (
        cx: number, cy: number, label: string, col: string, alpha: number,
        scale = 1,
      ) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `700 ${(8.5 * scale).toFixed(2)}px DM Sans, sans-serif`;
        const tw = ctx.measureText(label).width;
        const padX = 7 * scale;
        const bw = tw + padX * 2;
        const bh = 14 * scale;
        const bx = cx - bw / 2;
        const by = cy - bh / 2;
        const rr = 4;
        ctx.fillStyle = 'rgba(6,6,14,0.94)';
        ctx.strokeStyle = col + 'b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + rr, by);
        ctx.lineTo(bx + bw - rr, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
        ctx.lineTo(bx + bw, by + bh - rr);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
        ctx.lineTo(bx + rr, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
        ctx.lineTo(bx, by + rr);
        ctx.quadraticCurveTo(bx, by, bx + rr, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1px' as unknown as string; // best-effort, ignored on older
        ctx.fillText(label, cx, cy + 0.5);
        ctx.restore();
      };

      // ── DRAW SECTOR NODES ──
      const drawNode = (node: NodePos, isSector: boolean, opts: { dim: boolean; selected: boolean; hovered: boolean }) => {
        const { dim, selected: isSel, hovered: isHov } = opts;
        const nx = node.x * W;
        const ny = node.y * H;
        const r = node.baseR;
        if (r < 1) return;

        // Hover / select halo.
        if (isSel || isHov) {
          const grd = ctx.createRadialGradient(nx, ny, r, nx, ny, r + 36);
          grd.addColorStop(0, node.color + '55');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(nx, ny, r + 36, 0, Math.PI * 2);
          ctx.fill();
        }

        // Pulse ring — slow, ambient.
        if (!dim) {
          const t = performance.now() / 1000;
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + node.x * 8);
          ctx.strokeStyle = node.color + Math.round(pulse * 70).toString(16).padStart(2, '0');
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, r + 4 + pulse * 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Fill.
        if (node.isMetalsParent) {
          // Metallic linear gradient: gold → silver → gold edge.
          const fg = ctx.createLinearGradient(nx - r, ny - r, nx + r, ny + r);
          if (dim) {
            fg.addColorStop(0, '#181828');
            fg.addColorStop(1, '#0c0c1a');
          } else {
            fg.addColorStop(0.0, '#f5d78e');
            fg.addColorStop(0.32, '#d4a843');
            fg.addColorStop(0.55, '#e7ecf4');
            fg.addColorStop(0.8, '#8fb8cc');
            fg.addColorStop(1.0, '#d4a843');
          }
          ctx.globalAlpha = dim ? 0.35 : 1;
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.fill();
          if (!dim) {
            // Specular highlight.
            const sg = ctx.createRadialGradient(nx - r * 0.4, ny - r * 0.45, 0, nx - r * 0.4, ny - r * 0.45, r * 0.7);
            sg.addColorStop(0, 'rgba(255,255,255,0.55)');
            sg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const fg = ctx.createRadialGradient(nx - r * 0.3, ny - r * 0.3, 0, nx, ny, r);
          fg.addColorStop(0, dim ? '#181828' : node.color + 'd9');
          fg.addColorStop(1, dim ? '#0c0c1a' : node.color + '38');
          ctx.globalAlpha = dim ? 0.35 : 1;
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = dim ? 'rgba(255,255,255,0.07)' : node.color + (isSel ? 'ee' : '99');
        ctx.lineWidth = isSel ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Sector marker: tiny chevron hint when collapsed (tells you it's expandable).
        if (isSector && !dim && (stateRef.current.expansion[node.id as SectorId] || 0) < 0.3) {
          ctx.font = `${Math.round(r * 0.22)}px DM Sans, sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('\u2295', nx + r * 0.62, ny - r * 0.62);
        }

        const sectorExpansion = isSector
          ? (stateRef.current.expansion[node.id as SectorId] || 0)
          : 0;
        // Hide the parent's giant centred % once it's clearly expanded — the
        // children would otherwise crash into it.
        const showCenterContent = !isSector || sectorExpansion < 0.55;
        const chgCol = node.chg >= 0 ? '#4caf50' : '#ef5350';

        if (showCenterContent) {
          // Icon (children only) sits above the % so the visual reads
          // icon → metric → name top-to-bottom. Prefer brand-accurate SVG
          // logos for crypto via drawImage; fall back to the Unicode glyph
          // (Au / Ag / ⚛ / ⚡ / etc.) for everything else.
          if (!isSector) {
            const iconY = ny - r * 0.34;
            const logo = logosRef.current[node.id];
            const logoReady = !!logo && logo.complete && logo.naturalWidth > 0;
            if (logoReady) {
              const iconSize = Math.max(20, Math.round(r * 0.62));
              ctx.save();
              ctx.globalAlpha = dim ? 0.4 : 1;
              ctx.drawImage(
                logo,
                nx - iconSize / 2,
                iconY - iconSize / 2,
                iconSize,
                iconSize,
              );
              ctx.restore();
            } else if (node.icon) {
              const iconSize = Math.max(12, Math.round(r * 0.50));
              ctx.font = `700 ${iconSize}px Inter, "Apple Color Emoji", "Segoe UI Symbol", DM Sans, sans-serif`;
              ctx.fillStyle = dim ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.94)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(node.icon, nx, iconY);
            }
          }

          // % change.
          const fontSize = Math.max(10, Math.round(r * (isSector ? 0.30 : 0.26)));
          ctx.font = `600 ${fontSize}px DM Sans, sans-serif`;
          ctx.fillStyle = dim ? 'rgba(255,255,255,0.2)' : chgCol;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Sectors keep % slightly above centre; children push it below the
          // icon to leave room for the label underneath.
          const pctY = isSector ? ny - r * 0.12 : ny + r * 0.10;
          ctx.fillText(
            `${node.chg >= 0 ? '+' : ''}${node.chg.toFixed(2)}%`,
            nx,
            pctY,
          );

          // Label.
          const labelSize = Math.max(9, Math.round(r * (isSector ? 0.20 : 0.20)));
          ctx.font = `400 ${labelSize}px DM Sans, sans-serif`;
          ctx.fillStyle = dim
            ? 'rgba(255,255,255,0.22)'
            : node.isMetalsParent
            ? 'rgba(0,0,0,0.78)'
            : 'rgba(255,255,255,0.9)';
          const lblY = isSector ? ny + r * 0.32 : ny + r * 0.42;
          ctx.fillText(node.label, nx, lblY);
        }

        // ── Below-bubble header for expanded sectors ──
        // When the parent's centre is given over to its children, the parent
        // identity moves to a single line below: "CRYPTO  ·  -0.12%". Fades
        // in with expansion so it doesn't pop on click.
        if (isSector && sectorExpansion > 0.55) {
          const fade = Math.min(1, (sectorExpansion - 0.55) / 0.35);
          const headerY = ny + r + 22;
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.font = '600 13px DM Sans, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const chgText = `${node.chg >= 0 ? '+' : ''}${node.chg.toFixed(2)}%`;
          const labelText = node.label.toUpperCase();
          const sepText = '  ·  ';
          const labelW = ctx.measureText(labelText).width;
          const sepW = ctx.measureText(sepText).width;
          const chgW = ctx.measureText(chgText).width;
          const totalW = labelW + sepW + chgW;
          const startX = nx - totalW / 2;
          ctx.fillStyle = node.color;
          ctx.fillText(labelText, startX, headerY);
          ctx.fillStyle = 'rgba(255,255,255,0.32)';
          ctx.fillText(sepText, startX + labelW, headerY);
          ctx.fillStyle = chgCol;
          ctx.fillText(chgText, startX + labelW + sepW, headerY);
          ctx.restore();
        }

        // ── RECEIVING / OUTFLOW / BALANCED status chip above the node ──
        // Sectors use macro flows (sectorFlows); children use intra-sector flows.
        // Hidden when the node is dimmed (something else is selected) so the
        // panel doesn't fight the focus state. Children also fade in with the
        // sector's expansion so they don't pop mid-animation.
        if (!dim) {
          const flowSet = isSector ? stateRef.current.sectorFlows : intraFlows;
          // Children only have meaningful net once their parent is expanded.
          const childParent = node.parent;
          const expGate = !isSector && childParent
            ? (stateRef.current.expansion[childParent] || 0)
            : 1;
          if (expGate > 0.55) {
            const net = netForNode(node.id, flowSet);
            const status = statusFor(net);
            // Chip alpha = 1 for sectors; for children fade with expansion.
            const chipAlpha = isSector ? 1 : Math.min(1, (expGate - 0.55) / 0.35);
            // Slightly smaller chip on child bubbles so it doesn't dominate.
            const chipScale = isSector ? 1 : 0.85;
            drawChip(nx, ny - r - 12, status.label, status.col, chipAlpha, chipScale);
          }
        }
      };

      // Sectors first (children draw on top).
      for (const n of sectorNodes) {
        const dim = !!sel && sel !== n.id && childNodes.every((c) => c.id !== sel);
        drawNode(n, true, { dim, selected: sel === n.id, hovered: hov === n.id });
      }
      // Children on top. A child is dimmed only when something *outside* its
      // family is selected — when its own parent sector is selected (so the
      // panel is open showing that sector's flows), the children should remain
      // bright so the user can still read them. Previously we dimmed every
      // non-selected child, which made the orbiting sub-bubbles look faded
      // every time the parent sector's panel was open.
      for (const n of childNodes) {
        if (n.baseR < 4) continue;
        const parentSelected = sel === n.parent;
        const dim = !!sel && sel !== n.id && !parentSelected;
        drawNode(n, false, { dim, selected: sel === n.id, hovered: hov === n.id });
      }
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      ro.disconnect();
    };
    // intraFlows is read inside draw via closure. We re-attach on its change so
    // the loop sees the latest list when expanding/collapsing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intraFlows]);

  // ── Side panel selection: find data for the currently-selected node ──
  const selectedDescriptor = React.useMemo(() => {
    if (!data || !selected) return null;
    const sec = data.sectorIndex[selected as SectorId];
    if (sec) {
      return {
        id: sec.id,
        label: sec.label,
        sub: sec.sub,
        chg: sec.chg,
        color: sec.color,
        isSector: true,
      };
    }
    for (const s of data.sectors) {
      const c = s.children.find((cc) => cc.id === selected);
      if (c) {
        return {
          id: c.id,
          label: c.label,
          sub: c.sub,
          chg: c.chg,
          color: c.color,
          isSector: false,
        };
      }
    }
    return null;
  }, [data, selected]);

  const inFlows = selected
    ? allFlowsForPanel
        .filter((f) => (f.dir > 0 ? f.to : f.from) === selected)
        .sort((a, b) => b.strength - a.strength)
    : [];
  const outFlows = selected
    ? allFlowsForPanel
        .filter((f) => (f.dir > 0 ? f.from : f.to) === selected)
        .sort((a, b) => b.strength - a.strength)
    : [];
  const findNodeById = (id: string) => {
    if (!data) return null;
    const s = data.sectorIndex[id as SectorId];
    if (s) return { label: s.label, color: s.color };
    for (const sec of data.sectors) {
      const c = sec.children.find((cc) => cc.id === id);
      if (c) return { label: c.label, color: c.color };
    }
    return null;
  };

  const liveCount = data ? data.sectors.filter((s) => s.realData).length : 0;

  // Side-panel placement: when the selected node lives on the right half of
  // the canvas (Crypto x=0.80, Stocks x=0.70) the panel flips to the LEFT so
  // it doesn't sit on top of the orbiting children. Left-side sectors keep
  // the default right placement. Threshold > 0.55 so Cash (x=0.50) stays
  // anchored right.
  const panelOnLeft = React.useMemo(() => {
    if (!selected || !data) return false;
    let sectorId: SectorId | null = null;
    if (data.sectorIndex[selected as SectorId]) {
      sectorId = selected as SectorId;
    } else {
      for (const s of data.sectors) {
        if (s.children.find((c) => c.id === selected)) {
          sectorId = s.id;
          break;
        }
      }
    }
    if (!sectorId) return false;
    return SECTOR_POS[sectorId].x > 0.55;
  }, [selected, data]);

  return (
    <div style={S.page}>
      {/* ── SIDEBAR ── */}
      <div style={S.sidebar}>
        <div style={{ marginBottom: 18 }}>
          <div style={S.eyebrow}>Capital Rotation</div>
          <div
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 22,
              color: '#ece4d4',
              lineHeight: 1.25,
              marginTop: 4,
            }}
          >
            Where is money
            <br />
            moving?
          </div>
        </div>

        {/* Time range */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {(['24h', '7d', '30d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: 4,
                background: range === r ? 'rgba(255,255,255,0.09)' : 'transparent',
                border: `1px solid ${range === r ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}`,
                color: range === r ? '#e8e0d0' : 'rgba(255,255,255,0.32)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Collapse-all hint when sector is expanded */}
        {expanded && (
          <button
            onClick={() => {
              setExpanded(null);
              setSelected(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '7px 10px',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.55)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 10,
              letterSpacing: 1,
              width: '100%',
            }}
          >
            <span style={{ fontSize: 12 }}>×</span>
            Collapse {data?.sectorIndex[expanded]?.label}
          </button>
        )}

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          {loading ? (
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#f5d78e',
                boxShadow: '0 0 5px rgba(245,215,142,0.5)',
                animation: 'cfpulse 1s infinite',
              }}
            />
          ) : (
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#4caf50',
                boxShadow: '0 0 5px #4caf50',
              }}
            />
          )}
          <span style={S.eyebrow}>
            {loading ? 'Fetching…' : `Live · ${RANGE_LABELS[range]} · ${liveCount}/5 sectors`}
          </span>
        </div>

        {/* Narrative */}
        <div style={S.card}>
          <div style={S.eyebrow}>Flow Narrative</div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
              {[100, 85, 93, 75, 88, 70].map((w, i) => (
                <div
                  key={i}
                  style={{
                    height: 11,
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 2,
                    width: `${w}%`,
                    animation: `cfshimmer 1.5s ${i * 0.1}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 11.5,
                lineHeight: 1.85,
                color: 'rgba(232,224,208,0.74)',
                marginTop: 10,
              }}
            >
              {narrativeText}
            </div>
          )}
        </div>

        {/* How this works — collapsible methodology card */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setMethodOpen((p) => !p)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 11px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 5,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.55)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            <span>How this works</span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>{methodOpen ? '−' : '+'}</span>
          </button>
          {methodOpen && (
            <div
              style={{
                ...S.card,
                marginTop: 6,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 10.5,
                lineHeight: 1.7,
                color: 'rgba(232,224,208,0.66)',
              }}
            >
              <div style={{ color: '#d4a843', fontSize: 9.5, letterSpacing: 1.5, marginBottom: 6 }}>
                % INSIDE BUBBLE
              </div>
              <div style={{ marginBottom: 10 }}>
                Mcap-weighted return of the bucket over the selected window
                (24h / 7d / 30d). For a sub-asset it&apos;s the raw return.
              </div>
              <div style={{ color: '#4a8fe8', fontSize: 9.5, letterSpacing: 1.5, marginBottom: 6 }}>
                % ON RIBBON ARROW
              </div>
              <div style={{ marginBottom: 10 }}>
                The outperformance gap (destination − source). +1.42% means the
                destination beat the source by 1.42 pts over the window. Not a
                dollar amount — a relative-strength score.
              </div>
              <div style={{ color: '#48c09e', fontSize: 9.5, letterSpacing: 1.5, marginBottom: 6 }}>
                FLOW DIRECTION
              </div>
              <div style={{ marginBottom: 10 }}>
                Inferred via relative momentum: capital is shown as gravitating
                toward the outperformer. <em style={{ color: 'rgba(255,255,255,0.5)' }}>Not literal dollar
                tracking</em> — that requires paid ETF-flow feeds (Lipper / EPFR).
              </div>
              <div style={{ color: '#7c8597', fontSize: 9.5, letterSpacing: 1.5, marginBottom: 6 }}>
                STATUS CHIP
              </div>
              <div>
                RECEIVING / OUTFLOW / BALANCED = sign of (sum of incoming flow
                strengths − sum of outgoing). A sector is RECEIVING when most
                pairwise gaps point inward.
              </div>
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  fontSize: 9.5,
                  color: 'rgba(255,255,255,0.32)',
                }}
              >
                Sources: CoinGecko (crypto), Yahoo Finance (QQQ / XLE / XLF /
                IWM / TLT / SHY / LQD / DXY), in-app gold/silver feed.
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ marginTop: 16 }}>
          <div style={S.eyebrow}>
            {expanded
              ? `${data?.sectorIndex[expanded]?.label ?? ''} Components`
              : 'Asset Classes'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            {sidebarNodes.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  // Sidebar click = select on canvas (and expand if it's a sector).
                  const isSector = !!data?.sectorIndex[n.id as SectorId];
                  if (isSector && !expanded) {
                    setExpanded(n.id as SectorId);
                  }
                  setSelected((p) => (p === n.id ? null : n.id));
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  background: selected === n.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: `1px solid ${selected === n.id ? n.color + '44' : 'transparent'}`,
                  borderRadius: 4,
                  padding: '6px 9px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: n.color,
                    boxShadow: `0 0 5px ${n.color}88`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 11,
                      color: selected === n.id ? n.color : 'rgba(255,255,255,0.6)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.label}
                  </div>
                  {n.sub && (
                    <div
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 8.5,
                        color: 'rgba(255,255,255,0.22)',
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.sub}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 10,
                    color: n.chg >= 0 ? '#4caf50' : '#ef5350',
                    flexShrink: 0,
                  }}
                >
                  {n.chg >= 0 ? '+' : ''}
                  {n.chg.toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top movers ticker */}
        <div
          style={{
            height: 36,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(4,4,10,0.92)',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 70,
              background: 'linear-gradient(to right, rgba(4,4,10,1), transparent)',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 12,
            }}
          >
            <span
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 8.5,
                letterSpacing: 2,
                color: 'rgba(255,255,255,0.32)',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              Top Movers
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              paddingLeft: 80,
              whiteSpace: 'nowrap',
              transform: `translateX(${tickerPos % (Math.max(1, topMovers.length) * 160 + 1)}px)`,
              transition: 'none',
            }}
          >
            {[...topMovers, ...topMovers].map((n, i) => (
              <div
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 24px',
                  borderRight: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  style={{ width: 5, height: 5, borderRadius: '50%', background: n.color }}
                />
                <span
                  style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.72)' }}
                >
                  {n.label}
                </span>
                <span
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 11,
                    color: n.chg >= 0 ? '#4caf50' : '#ef5350',
                    fontWeight: 500,
                  }}
                >
                  {n.chg >= 0 ? '+' : ''}
                  {n.chg.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 40,
              background: 'linear-gradient(to left, rgba(4,4,10,1), transparent)',
              zIndex: 2,
            }}
          />
        </div>

        {/* Canvas area — outer is relative (anchors hint + side panel), inner
            is the scroll surface so the canvas can grow taller than the
            viewport when an edge-pentagon sector (Cash / Bonds / Stocks)
            expands and would otherwise clip. */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            ref={scrollWrapRef}
            className="cf-scroll"
            style={{ position: 'absolute', inset: 0, overflowY: 'scroll', overflowX: 'hidden' }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: canvasH ? `${canvasH}px` : '100%',
                display: 'block',
              }}
            />
          </div>

          {/* Hint */}
          {!expanded && !loading && (
            <div
              style={{
                position: 'absolute',
                bottom: 18,
                left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 9.5,
                letterSpacing: 2,
                color: 'rgba(255,255,255,0.22)',
                textTransform: 'uppercase',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Click any sector to expand its sub-assets · Click again to collapse
            </div>
          )}

          {/* Selected node panel */}
          {selectedDescriptor && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                ...(panelOnLeft ? { left: 16 } : { right: 16 }),
                width: 260,
                background: 'rgba(4,4,12,0.97)',
                border: `1px solid ${selectedDescriptor.color}44`,
                borderRadius: 10,
                padding: '18px 20px',
                backdropFilter: 'blur(28px)',
                boxShadow: `0 0 40px ${selectedDescriptor.color}1a`,
                animation: 'cfFadeIn 0.22s ease',
              }}
            >
              <button
                onClick={() => setSelected(null)}
                style={{
                  position: 'absolute',
                  top: 11,
                  right: 13,
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: selectedDescriptor.color,
                    boxShadow: `0 0 7px ${selectedDescriptor.color}`,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 12,
                      color: selectedDescriptor.color,
                      fontWeight: 500,
                    }}
                  >
                    {selectedDescriptor.label}
                  </div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8.5, color: 'rgba(255,255,255,0.3)' }}>
                    {selectedDescriptor.sub}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 32,
                  fontWeight: 300,
                  color: '#ece4d4',
                  marginBottom: 3,
                }}
              >
                {selectedDescriptor.chg >= 0 ? '+' : ''}
                {selectedDescriptor.chg.toFixed(2)}%
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 8.5, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
                {RANGE_LABELS[range]} change
              </div>

              {inFlows.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 8,
                      letterSpacing: 2,
                      color: '#4caf50',
                      textTransform: 'uppercase',
                      marginBottom: 7,
                    }}
                  >
                    Receiving from
                  </div>
                  {inFlows.slice(0, 3).map((f, i) => {
                    const src = findNodeById(f.dir > 0 ? f.from : f.to);
                    if (!src) return null;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <div
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: src.color,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, fontFamily: 'DM Sans, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                          {src.label}
                        </div>
                        <div style={{ width: 52, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                          <div
                            style={{
                              width: `${Math.min(100, f.strength * 24)}%`,
                              height: '100%',
                              background: '#4caf50',
                              borderRadius: 1,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {outFlows.length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 8,
                      letterSpacing: 2,
                      color: '#ef5350',
                      textTransform: 'uppercase',
                      marginBottom: 7,
                    }}
                  >
                    Flowing to
                  </div>
                  {outFlows.slice(0, 3).map((f, i) => {
                    const dst = findNodeById(f.dir > 0 ? f.to : f.from);
                    if (!dst) return null;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <div
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: dst.color,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, fontFamily: 'DM Sans, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                          {dst.label}
                        </div>
                        <div style={{ width: 52, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                          <div
                            style={{
                              width: `${Math.min(100, f.strength * 24)}%`,
                              height: '100%',
                              background: '#ef5350',
                              borderRadius: 1,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes cfpulse   { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes cfshimmer { 0%,100%{opacity:.18} 50%{opacity:.45} }
        @keyframes cfFadeIn  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }

        /* Force a visible custom scrollbar on the canvas wrapper. macOS hides
           native scrollbars by default, so users couldn't tell the area was
           scrollable when an edge-pentagon sector (Cash / Bonds / Stocks)
           expanded beyond the viewport. */
        .cf-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .cf-scroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.025);
        }
        .cf-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 5px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .cf-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.32);
          background-clip: padding-box;
          border: 2px solid transparent;
        }
        /* Firefox */
        .cf-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) rgba(255,255,255,0.025); }
      `}</style>
    </div>
  );
};

const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#06060e',
  },
  sidebar: {
    width: 268,
    flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    padding: '22px 16px',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 5,
    padding: '14px 16px',
  },
  eyebrow: {
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 9,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
  },
};
