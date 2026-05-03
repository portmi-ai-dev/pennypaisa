// Mini SVG visualisations for Intelligence page driver cards.
//
// Each driver in the bullish/bearish lists maps to a tiny inline-SVG chart
// that gives the data a visual story instead of plain text. Charts are
// hand-tuned to ~40-52px tall so they fit inside a pill-shaped card.
//
// `getDriverViz()` matches a driver's text (lowercased substring) to the
// right component. Designs come from the Claude Design handoff bundle —
// patterns and historical data points are preserved.

import * as React from 'react';

// ─── Common props ──────────────────────────────────────────────────────────

interface VizProps {
  color: string;
  width?: number;
  height?: number;
}

// Sanitize hex for use inside an SVG `id` attribute.
const sId = (c: string) => c.replace('#', '').replace(/[^0-9A-Fa-f]/g, '') || 'x';

// ─── Peak-to-peak cycle chart (Gold ATH waves) ────────────────────────────

interface CyclePeakChartProps extends VizProps {
  peaks: { year: number; value: number; label: string }[];
}

export const CyclePeakChart: React.FC<CyclePeakChartProps> = ({
  peaks, color, width = 220, height = 64,
}) => {
  const values = peaks.map(p => p.value);
  const min = 0;
  const max = Math.max(...values) * 1.1;
  const range = max - min;
  const totalYears = peaks[peaks.length - 1].year - peaks[0].year;

  const xs = peaks.map(p => ((p.year - peaks[0].year) / totalYears) * (width - 20) + 10);
  const ys = peaks.map(p => height - 18 - ((p.value - min) / range) * (height - 28));

  // Add valley between every pair of peaks so the line dips like a real cycle.
  const allPoints: Array<{ x: number; y: number; isPeak: boolean; peak?: typeof peaks[0] }> = [];
  for (let i = 0; i < peaks.length; i++) {
    if (i > 0) {
      allPoints.push({ x: (xs[i - 1] + xs[i]) / 2, y: height - 10, isPeak: false });
    }
    allPoints.push({ x: xs[i], y: ys[i], isPeak: true, peak: peaks[i] });
  }
  const pathD = allPoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');

  const id = `cycleGrad-${sId(color)}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathD} L${allPoints[allPoints.length - 1].x},${height} L${allPoints[0].x},${height} Z`}
        fill={`url(#${id})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="iv-line"
        opacity={0.9}
      />
      {allPoints.filter(p => p.isPeak).map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r="3" fill={color} opacity={0.9} />
          <circle cx={pt.x} cy={pt.y} r="6" fill={color} opacity={0.15} />
          {pt.peak?.label && (
            <text x={pt.x} y={pt.y - 7} textAnchor="middle" fill={color}
                  fontSize="8" fontFamily="DM Sans" opacity={0.85}>
              {pt.peak.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};

// Pre-configured Gold cycle (2008→2026)
export const GoldCyclePeakChart: React.FC<{ color: string }> = ({ color }) => (
  <CyclePeakChart
    color={color}
    width={220}
    height={64}
    peaks={[
      { year: 2008, value: 900,  label: '' },
      { year: 2011, value: 1920, label: "'11 ATH" },
      { year: 2015, value: 1050, label: '' },
      { year: 2020, value: 2075, label: "'20 ATH" },
      { year: 2022, value: 1620, label: '' },
      { year: 2026, value: 3300, label: "'26 ATH" },
    ]}
  />
);

// ─── Geopolitical events timeline (replaces abstract heat-map) ────────────
// Real Geopolitical Risk Index over 2020 → 2026, with the actual major
// conflict events labelled at their spike points. Tells the same story —
// "elevated geopolitical risk premium" — but with concrete history a reader
// can immediately recognise.

export const GeopoliticalEventsChart: React.FC<VizProps> = ({
  color, width = 220, height = 64,
}) => {
  // Risk index normalised to 0-100. Year is fractional so events land on
  // the right date (2022 Q1 = 2022.0; 2023 Q4 = 2023.75 etc.).
  // `anchor` lets edge labels (Iran-US war at the right edge) align right
  // so they don't overflow past the viewBox.
  const events: Array<{ yr: number; val: number; lbl: string; anchor?: 'middle' | 'end' }> = [
    { yr: 2020.0,  val: 28, lbl: '' },
    { yr: 2020.5,  val: 32, lbl: '' },
    { yr: 2021.0,  val: 22, lbl: '' },
    { yr: 2022.1,  val: 96, lbl: 'Ukraine' },     // Russia-Ukraine invasion
    { yr: 2022.7,  val: 55, lbl: '' },
    { yr: 2023.4,  val: 42, lbl: '' },
    { yr: 2023.78, val: 88, lbl: 'Oct 7' },       // Israel-Hamas war
    { yr: 2024.3,  val: 78, lbl: '' },            // Iran-Israel strikes — label cleared per spec
    { yr: 2024.9,  val: 60, lbl: '' },
    { yr: 2025.4,  val: 64, lbl: '' },
    { yr: 2026.1,  val: 86, lbl: 'Iran-US war', anchor: 'end' }, // 'now' renamed
  ];
  const minYr = events[0].yr;
  const span = events[events.length - 1].yr - minYr;
  const xs = events.map(e => ((e.yr - minYr) / span) * (width - 16) + 8);
  const ys = events.map(e => height - 14 - (e.val / 100) * (height - 22));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const id = `geoEvtGrad-${sId(color)}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Baseline grid */}
      <line x1="0" y1={height - 14} x2={width} y2={height - 14}
            stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="2,2" />
      {/* Filled risk area */}
      <path
        d={`${path} L${xs[xs.length - 1]},${height - 14} L${xs[0]},${height - 14} Z`}
        fill={`url(#${id})`}
      />
      {/* Risk line */}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="iv-line" opacity={0.92} />
      {/* Labelled spike markers — anchor honoured so edge labels stay in-frame */}
      {events.map((e, i) =>
        e.lbl ? (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r="3.5" fill={color} opacity={0.95} />
            <circle cx={xs[i]} cy={ys[i]} r="7" fill={color} opacity={0.14} />
            <text x={xs[i]} y={ys[i] - 8}
                  textAnchor={e.anchor ?? 'middle'}
                  fill={color} fontSize="8" fontFamily="DM Sans"
                  fontWeight="600">{e.lbl}</text>
          </g>
        ) : null,
      )}
      {/* y-axis label */}
      <text x={2} y={10} fill="rgba(255,255,255,0.4)"
            fontSize="7" fontFamily="DM Sans">GPR Index</text>
    </svg>
  );
};

// Kept for backward-compat — abstract heatmap (no longer wired in by default).
export const GeoHeatMap: React.FC<VizProps> = ({ color, width = 100, height = 42 }) => {
  const grid = [
    [0.9, 0.6, 0.3, 0.5, 0.7],
    [0.4, 0.8, 0.5, 0.9, 0.3],
    [0.6, 0.3, 0.7, 0.4, 0.8],
    [0.3, 0.7, 0.9, 0.6, 0.4],
  ];
  const cw = width / 5;
  const rh = height / 4;
  return (
    <svg width={width} height={height}>
      {grid.flatMap((row, ri) =>
        row.map((val, ci) => (
          <rect
            key={`${ri}-${ci}`}
            x={ci * cw + 1} y={ri * rh + 1}
            width={cw - 2} height={rh - 2}
            rx={2}
            fill={color}
            opacity={val * 0.7}
          />
        )),
      )}
    </svg>
  );
};

// ─── Central-bank accumulation (yearly bars) ──────────────────────────────

export const AccumulationChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const data = [
    { year: '21', val: 450 },
    { year: '22', val: 1082 },
    { year: '23', val: 1037 },
    { year: '24', val: 1045 },
  ];
  const max = 1200;
  const bw = (width / data.length) - 6;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = (d.val / max) * (height - 12);
        const x = i * (bw + 6) + 3;
        const y = height - 12 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={barH} rx={2}
                  fill={color} opacity={i === data.length - 1 ? 0.85 : 0.4} />
            <text x={x + bw / 2} y={height - 2} textAnchor="middle"
                  fill={color} fontSize="7.5" fontFamily="DM Sans" opacity={0.7}>{d.year}</text>
          </g>
        );
      })}
      <text x={width} y={8} textAnchor="end" fill={color}
            fontSize="7.5" fontFamily="DM Sans" opacity={0.6}>tonnes</text>
    </svg>
  );
};

// ─── Bar comparison (de-dollarisation reserves) ───────────────────────────

interface BarComparisonProps extends VizProps {
  bars: { label: string; value: number; max: number }[];
}

export const BarComparison: React.FC<BarComparisonProps> = ({
  bars, color, width = 200, height = 60,
}) => {
  const barH = Math.floor((height - (bars.length - 1) * 4) / bars.length);
  return (
    <svg width={width} height={height}>
      {bars.map((b, i) => {
        const y = i * (barH + 4);
        const fillW = (b.value / b.max) * (width - 50);
        return (
          <g key={i}>
            <rect x={0} y={y} width={width - 50} height={barH} rx={barH / 2}
                  fill="rgba(255,255,255,0.05)" />
            <rect x={0} y={y} width={fillW} height={barH} rx={barH / 2}
                  fill={color} opacity={0.7} />
            <text x={fillW + 4} y={y + barH - 2} fill={color}
                  fontSize="8" fontFamily="DM Sans" opacity={0.85}>{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── Supply-vs-demand area chart (silver deficit) ─────────────────────────

export const SupplyDemandChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const years = [2020, 2021, 2022, 2023, 2024, 2025];
  const supply = [1000, 1010, 1020, 1015, 1008, 1005];
  const demand = [980, 1020, 1060, 1080, 1110, 1145];
  const all = [...supply, ...demand];
  const min = Math.min(...all) * 0.97;
  const max = Math.max(...all) * 1.03;
  const range = max - min;
  const xs = years.map((_, i) => (i / (years.length - 1)) * width);
  const supplyYs = supply.map(v => height - ((v - min) / range) * height);
  const demandYs = demand.map(v => height - ((v - min) / range) * height);
  const sP = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${supplyYs[i].toFixed(1)}`).join(' ');
  const dP = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${demandYs[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={sP} fill="none" stroke="rgba(160,180,200,0.5)" strokeWidth="1.2" strokeDasharray="3,2" />
      <path d={dP} fill="none" stroke={color} strokeWidth="1.5" className="iv-line" opacity={0.9} />
      <text x={width} y={supplyYs[supplyYs.length - 1] - 3} textAnchor="end"
            fill="rgba(160,180,200,0.6)" fontSize="7.5" fontFamily="DM Sans">supply</text>
      <text x={width} y={demandYs[demandYs.length - 1] - 3} textAnchor="end"
            fill={color} fontSize="7.5" fontFamily="DM Sans">demand</text>
      {/* deficit shading from year-3 onward */}
      <path
        d={`M${xs[2].toFixed(1)},${supplyYs[2].toFixed(1)} ${xs.slice(2)
          .map((x, i) => `L${x.toFixed(1)},${supplyYs[i + 2].toFixed(1)}`).join(' ')} ${[...xs.slice(2)].reverse()
          .map((x, i) => `L${x.toFixed(1)},${demandYs[demandYs.length - 1 - i].toFixed(1)}`).join(' ')} Z`}
        fill={color}
        opacity={0.08}
      />
    </svg>
  );
};

// ─── AI / data-centre exponential ramp ────────────────────────────────────

export const AIDataCenterChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pts = [10, 14, 19, 28, 42, 65, 95, 138, 195];
  return (
    <SimpleArea
      pts={pts} color={color} width={width} height={height} idSuffix="ai"
      annotation={{ x: width - 4, y: 11, text: '+50% by 2027', anchor: 'end' }}
    />
  );
};

// ─── Solar / EV demand (yearly GW bars) ───────────────────────────────────

export const SolarDemandChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const data = [
    { y: '20', v: 130 }, { y: '21', v: 168 }, { y: '22', v: 240 },
    { y: '23', v: 345 }, { y: '24', v: 420 }, { y: '25e', v: 520 },
  ];
  const max = 580;
  const bw = Math.floor((width - (data.length - 1) * 4) / data.length);
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = (d.v / max) * (height - 12);
        const x = i * (bw + 4);
        const y = height - 12 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={barH} rx={2}
                  fill={color} opacity={i === data.length - 1 ? 0.9 : 0.38 + i * 0.08} />
            <text x={x + bw / 2} y={height - 2} textAnchor="middle"
                  fill={color} fontSize="7" fontFamily="DM Sans" opacity={0.6}>{d.y}</text>
          </g>
        );
      })}
      <text x={width - 1} y={10} textAnchor="end" fill={color}
            fontSize="7" fontFamily="DM Sans" opacity={0.6}>GW</text>
    </svg>
  );
};

// ─── Bitcoin halving cycle (log-scale peaks) ──────────────────────────────

export const HalvingCycleChart: React.FC<VizProps> = ({ color, width = 220, height = 64 }) => {
  const halvings = [
    { year: 2012, label: '2012',     val: 12 },
    { year: 2016, label: '2016',     val: 850 },
    { year: 2017, label: "'17 ATH", val: 19500 },
    { year: 2020, label: '2020',     val: 8900 },
    { year: 2021, label: "'21 ATH", val: 69000 },
    { year: 2024, label: '2024',     val: 40000 },
    { year: 2025, label: "'25 ATH", val: 109000 },
  ];
  const logVals = halvings.map(h => Math.log10(h.val + 1));
  const minL = Math.min(...logVals);
  const maxL = Math.max(...logVals);
  const totalY = halvings[halvings.length - 1].year - halvings[0].year;
  const xs = halvings.map(h => ((h.year - halvings[0].year) / totalY) * (width - 16) + 8);
  const ys = halvings.map((_, i) => height - 14 - ((logVals[i] - minL) / (maxL - minL)) * (height - 22));
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const isATH = halvings.map(h => h.label.includes('ATH'));
  const id = `halvingGrad-${sId(color)}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${pathD} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`} fill={`url(#${id})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" className="iv-line" strokeLinecap="round" />
      {halvings.map((h, i) =>
        isATH[i] ? (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r="3.5" fill={color} opacity={0.9} />
            <circle cx={xs[i]} cy={ys[i]} r="7" fill={color} opacity={0.12} />
            <text x={xs[i]} y={ys[i] - 8} textAnchor="middle" fill={color}
                  fontSize="7.5" fontFamily="DM Sans" fontWeight="600">{h.label}</text>
          </g>
        ) : (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r="2" fill="rgba(255,255,255,0.4)" />
            <text x={xs[i]} y={height - 2} textAnchor="middle"
                  fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="DM Sans">{h.label}</text>
          </g>
        ),
      )}
    </svg>
  );
};

// ─── ETF flows (monthly inflow bars) ──────────────────────────────────────

export const ETFFlowChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const data = [
    { m: 'Oct', v: 1.2 }, { m: 'Nov', v: 2.8 }, { m: 'Dec', v: 1.9 },
    { m: 'Jan', v: 3.4 }, { m: 'Feb', v: 4.1 }, { m: 'Mar', v: 3.8 },
    { m: 'Apr', v: 5.2 },
  ];
  const max = 6;
  const bw = Math.floor((width - (data.length - 1) * 3) / data.length);
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = (d.v / max) * (height - 12);
        const x = i * (bw + 3);
        const y = height - 12 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={barH} rx={2}
                  fill={color} opacity={i === data.length - 1 ? 0.9 : 0.45} />
            {i % 2 === 0 && (
              <text x={x + bw / 2} y={height - 2} textAnchor="middle"
                    fill={color} fontSize="7" fontFamily="DM Sans" opacity={0.6}>{d.m}</text>
            )}
          </g>
        );
      })}
      <text x={width - 1} y={8} textAnchor="end" fill={color}
            fontSize="7" fontFamily="DM Sans" opacity={0.6}>$B</text>
    </svg>
  );
};

// ─── US Strategic Reserve step-up ──────────────────────────────────────────

export const StrategicReserveChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  const btc = [0, 0, 207189, 207189, 207189, 207189, 207189, 207189];
  const xs = months.map((_, i) => (i / (months.length - 1)) * (width - 16) + 8);
  const max = 250000;
  const ys = btc.map(v => (height - 12) - (v / max) * (height - 20));
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={`${pathD} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`}
            fill={color} opacity={0.08} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" className="iv-line" />
      {btc.map((v, i) => v > 0 && i > 0 && btc[i - 1] === 0 ? (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r="3" fill={color} />
          <text x={xs[i]} y={ys[i] - 7} textAnchor="middle" fill={color}
                fontSize="7.5" fontFamily="DM Sans">207K BTC</text>
        </g>
      ) : null)}
    </svg>
  );
};

// ─── DXY inverse correlation ──────────────────────────────────────────────

export const DXYChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const dxy = [105, 102, 99, 104, 107, 103, 98, 95, 93, 90];
  const asset = [1800, 1900, 2100, 1950, 1850, 2000, 2200, 2400, 2600, 2900];
  const norm = (a: number[]) => {
    const mn = Math.min(...a), mx = Math.max(...a);
    return a.map(v => (v - mn) / (mx - mn));
  };
  const dxyN = norm(dxy);
  const aN = norm(asset);
  const xs = dxy.map((_, i) => (i / (dxy.length - 1)) * width);
  const dxyYs = dxyN.map(v => 4 + (1 - v) * (height - 8));
  const aYs = aN.map(v => 4 + (1 - v) * (height - 8));
  const dPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${dxyYs[i].toFixed(1)}`).join(' ');
  const aPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${aYs[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height}>
      <path d={dPath} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="2,2" />
      <path d={aPath} fill="none" stroke={color} strokeWidth="1.5" className="iv-line" opacity={0.85} />
      <text x={2} y={height - 2} fill="rgba(255,255,255,0.35)"
            fontSize="7" fontFamily="DM Sans">DXY ↓</text>
      <text x={width - 2} y={8} textAnchor="end" fill={color}
            fontSize="7" fontFamily="DM Sans">price ↑</text>
    </svg>
  );
};

// ─── M2 money-supply growth ───────────────────────────────────────────────

export const M2Chart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => (
  <SimpleArea
    pts={[100, 104, 107, 108, 121, 128, 127, 124, 126, 129, 132]}
    color={color} width={width} height={height} idSuffix="m2"
    annotation={{ x: 4, y: 11, text: 'M2 Global', anchor: 'start' }}
  />
);

// ─── CPI / cooling inflation ──────────────────────────────────────────────
// CPI line descends 9% → 2.4% → at the right end the curve is at the
// BOTTOM of the chart, so the previous bottom-right "2.4% now" label
// overlapped the line. Moved to top-right where the chart is empty
// (line is high there only at the start, falling away rightward).

export const CPIChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => (
  <SimpleArea
    pts={[2.1, 4.2, 7.0, 8.9, 7.1, 5.0, 3.2, 2.9, 2.6, 2.4]}
    color={color} width={width} height={height} idSuffix="cpi"
    annotation={{ x: width - 4, y: 11, text: '2.4% now', anchor: 'end' }}
  />
);

// ─── Volatility (jagged sparkline) ────────────────────────────────────────

export const VolatilityChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pts = [18, 22, 35, 28, 40, 55, 38, 42, 30, 25, 33, 38];
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * width);
  const ys = pts.map(v => height - ((v - min) / range) * (height - 4) - 2);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="iv-line" opacity={0.85} />
    </svg>
  );
};

// ─── Drawdown crash curve ─────────────────────────────────────────────────
// Label moved to top-right where the chart's empty space is (curve is
// high at start, crashes to bottom-right). Top-right is empty after the
// crash since values stay low through the recovery.

export const DrawdownChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => (
  <SimpleArea
    pts={[100, 95, 82, 70, 55, 40, 32, 28, 25, 28, 35, 42]}
    color={color} width={width} height={height} idSuffix="dd"
    annotation={{ x: width - 4, y: 11, text: '−75% peak-to-trough', anchor: 'end' }}
  />
);

// ─── Generic area-under-line (used by several drivers) ────────────────────

interface SimpleAreaProps extends VizProps {
  pts: number[];
  idSuffix: string;
  annotation?: { x: number; y: number; text: string; anchor: 'start' | 'end' };
}

const SimpleArea: React.FC<SimpleAreaProps> = ({
  pts, color, width = 200, height = 60, idSuffix, annotation,
}) => {
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * width);
  const ys = pts.map(v => height - ((v - min) / range) * (height - 4) - 2);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fillPath = `${path} L${width},${height} L0,${height} Z`;
  const id = `${idSuffix}Grad-${sId(color)}`;
  // Annotation gets a small dark backdrop pill so it stays legible even
  // when the line passes nearby. Approx text width via char count × font size.
  const annW = annotation ? Math.max(28, annotation.text.length * 5.4) : 0;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${id})`} opacity={0.25} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="iv-line" opacity={0.85} />
      {annotation && (
        <g>
          <rect
            x={annotation.anchor === 'end' ? annotation.x - annW - 2 : annotation.x - 2}
            y={annotation.y - 9}
            width={annW + 4}
            height={12}
            rx={3}
            fill="rgba(8,8,16,0.92)"
            stroke={`${color}55`}
            strokeWidth="0.5"
          />
          <text
            x={annotation.x}
            y={annotation.y}
            textAnchor={annotation.anchor}
            fill={color}
            fontSize="8"
            fontFamily="DM Sans"
            opacity={0.95}
          >
            {annotation.text}
          </text>
        </g>
      )}
    </svg>
  );
};

// ─── Silver lag-from-gold (rising sparkline) ──────────────────────────────

export const SilverFollowsGoldChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pts = [40, 42, 45, 50, 48, 52, 55, 58, 62, 70, 75, 80];
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * width);
  const ys = pts.map(v => height - ((v - mn) / rng) * (height - 4) - 2);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="iv-line" opacity={0.85} />
    </svg>
  );
};

// ─── Charts for previously unmapped drivers ───────────────────────────────
// Per user request: every driver — active OR inactive — gets a relevant
// visualisation. The following charts cover the drivers that previously
// fell through to a text-only card.

// Sideways drift inside a tight band — captures "prolonged consolidation".
export const ConsolidationChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pts = [50, 52, 48, 51, 49, 52, 47, 50, 53, 49, 51, 48, 52, 50];
  const bandTop = height * 0.35;
  const bandBot = height * 0.62;
  const min = Math.min(...pts), max = Math.max(...pts);
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * width);
  const ys = pts.map(v => bandBot - ((v - min) / (max - min)) * (bandBot - bandTop));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height}>
      <rect x={0} y={bandTop - 2} width={width} height={bandBot - bandTop + 4}
            fill={color} opacity={0.07} rx={3} />
      <line x1={0} y1={(bandTop + bandBot) / 2} x2={width} y2={(bandTop + bandBot) / 2}
            stroke={color} strokeWidth="0.5" strokeDasharray="2,2" opacity={0.35} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="iv-line" opacity={0.85} />
      <text x={width - 4} y={11} textAnchor="end" fill={color}
            fontSize="8" fontFamily="DM Sans" opacity={0.7}>range-bound</text>
    </svg>
  );
};

// Two diverging lines — "risk-on capital rotation" out of safety into risk.
export const RiskRotationChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  // Gold / safety line trends down; risk-asset proxy line trends up.
  const safetyPts = [60, 58, 56, 54, 52, 50, 47, 45, 43, 40];
  const riskPts =   [40, 42, 44, 47, 50, 54, 58, 62, 67, 72];
  const all = [...safetyPts, ...riskPts];
  const min = Math.min(...all), max = Math.max(...all), range = max - min;
  const xs = safetyPts.map((_, i) => (i / (safetyPts.length - 1)) * (width - 8) + 4);
  const safetyYs = safetyPts.map(v => height - 12 - ((v - min) / range) * (height - 22));
  const riskYs = riskPts.map(v => height - 12 - ((v - min) / range) * (height - 22));
  const safetyPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${safetyYs[i].toFixed(1)}`).join(' ');
  const riskPath   = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${riskYs[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={safetyPath} fill="none" stroke={color} strokeWidth="1.5"
            strokeDasharray="3,2" className="iv-line" opacity={0.85} />
      <path d={riskPath} fill="none" stroke="rgba(125,214,137,0.7)" strokeWidth="1.5"
            className="iv-line" opacity={0.85} />
      <text x={4} y={11} fill={color} fontSize="8" fontFamily="DM Sans">SAFE ↓</text>
      <text x={width - 4} y={11} textAnchor="end" fill="rgba(125,214,137,0.85)"
            fontSize="8" fontFamily="DM Sans">RISK ↑</text>
    </svg>
  );
};

// Step-up Fed funds rate path — "rising interest rates" / "Fed hawkish pivot"
export const RatesStepChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const fed = [
    { d: '22Q1', r: 0.25 },
    { d: '22Q3', r: 2.5 },
    { d: '23Q1', r: 4.75 },
    { d: '23Q3', r: 5.5 },
    { d: '24Q4', r: 4.5 },
    { d: 'now',  r: 4.0 },
  ];
  const max = 6;
  const xs = fed.map((_, i) => (i / (fed.length - 1)) * (width - 12) + 6);
  const ys = fed.map(p => (height - 14) - (p.r / max) * (height - 24));
  // Horizontal-then-vertical step path
  let path = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 1; i < fed.length; i++) {
    path += ` L${xs[i].toFixed(1)},${ys[i - 1].toFixed(1)} L${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
  }
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <line x1={0} y1={height - 14} x2={width} y2={height - 14}
            stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="square" className="iv-line" opacity={0.9} />
      {/* Mark the peak (highest rate) and the now point. */}
      {fed.map((p, i) => {
        const isPeak = p.r === Math.max(...fed.map(x => x.r));
        const isNow = p.d === 'now';
        if (!isPeak && !isNow) return null;
        return (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r={isPeak ? 3 : 2.5} fill={color} opacity={0.95} />
            <text x={xs[i]} y={ys[i] - 6} textAnchor="middle"
                  fill={color} fontSize="8" fontFamily="DM Sans" fontWeight="600">
              {p.r}%{isPeak ? ' peak' : ''}
            </text>
          </g>
        );
      })}
      <text x={4} y={11} fill={color} fontSize="8" fontFamily="DM Sans" opacity={0.7}>Fed funds</text>
    </svg>
  );
};

// Two side-by-side pillars — "dual store-of-value" (monetary + industrial)
export const DualPillarChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pillars = [
    { label: 'Monetary',   pct: 0.45 },
    { label: 'Industrial', pct: 0.55 },
  ];
  const pw = 56;
  const padX = (width - pw * 2 - 24) / 2;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {pillars.map((p, i) => {
        const x = padX + i * (pw + 24);
        const h = p.pct * (height - 22);
        const y = height - 14 - h;
        return (
          <g key={i}>
            <rect x={x} y={height - 14 - (height - 22)} width={pw} height={height - 22}
                  rx={3} fill={color} opacity={0.08} />
            <rect x={x} y={y} width={pw} height={h} rx={3}
                  fill={color} opacity={0.7} />
            <text x={x + pw / 2} y={y - 4} textAnchor="middle"
                  fill={color} fontSize="9" fontFamily="DM Sans" fontWeight="600">
              {Math.round(p.pct * 100)}%
            </text>
            <text x={x + pw / 2} y={height - 3} textAnchor="middle"
                  fill={color} fontSize="8" fontFamily="DM Sans" opacity={0.7}>
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// Quick spike-and-crash — "narrative exaggeration near tops"
export const SentimentSpikeChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pts = [10, 12, 15, 22, 35, 60, 95, 70, 40, 22, 18, 16];
  const min = Math.min(...pts), max = Math.max(...pts);
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * width);
  const ys = pts.map(v => height - 14 - ((v - min) / (max - min)) * (height - 22));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const peakIdx = pts.indexOf(max);
  const id = `spikeGrad-${sId(color)}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${xs[xs.length - 1]},${height - 14} L${xs[0]},${height - 14} Z`}
            fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="iv-line" opacity={0.9} />
      <circle cx={xs[peakIdx]} cy={ys[peakIdx]} r="3.5" fill={color} opacity={0.95} />
      <circle cx={xs[peakIdx]} cy={ys[peakIdx]} r="7" fill={color} opacity={0.16} />
      <text x={xs[peakIdx]} y={ys[peakIdx] - 8} textAnchor="middle"
            fill={color} fontSize="8" fontFamily="DM Sans" fontWeight="600">FOMO peak</text>
      <text x={4} y={11} fill={color} fontSize="8" fontFamily="DM Sans" opacity={0.7}>Sentiment</text>
    </svg>
  );
};

// Two parallel lines — gold flat, silver dragging — "gold consolidation drags silver"
export const LagDivergenceChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const gold   = [50, 52, 51, 50, 52, 53, 52, 51, 50, 51, 52, 50];
  const silver = [48, 50, 47, 45, 42, 40, 38, 36, 35, 33, 32, 30];
  const all = [...gold, ...silver];
  const min = Math.min(...all), max = Math.max(...all), range = max - min;
  const xs = gold.map((_, i) => (i / (gold.length - 1)) * (width - 8) + 4);
  const goldYs   = gold.map(v => height - 14 - ((v - min) / range) * (height - 24));
  const silverYs = silver.map(v => height - 14 - ((v - min) / range) * (height - 24));
  const goldPath   = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${goldYs[i].toFixed(1)}`).join(' ');
  const silverPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${silverYs[i].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height}>
      <path d={goldPath} fill="none" stroke="rgba(201,168,76,0.6)" strokeWidth="1.2"
            strokeDasharray="3,2" />
      <path d={silverPath} fill="none" stroke={color} strokeWidth="1.5"
            className="iv-line" opacity={0.9} />
      <text x={4} y={11} fill="rgba(201,168,76,0.7)" fontSize="8"
            fontFamily="DM Sans">Gold flat</text>
      <text x={width - 4} y={silverYs[silverYs.length - 1] - 4} textAnchor="end"
            fill={color} fontSize="8" fontFamily="DM Sans">Silver −38%</text>
    </svg>
  );
};

// PMI bars above/below the 50 contraction line — "industrial slowdown"
export const PMIContractionChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const pmi = [55, 53, 51, 49, 48, 47, 46, 47, 48, 47, 46, 45];
  const max = 60, min = 40, mid = 50;
  const bw = (width - (pmi.length - 1) * 2) / pmi.length;
  const yMid = height - 14 - ((mid - min) / (max - min)) * (height - 24);
  return (
    <svg width={width} height={height}>
      <line x1={0} y1={yMid} x2={width} y2={yMid}
            stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" strokeDasharray="2,2" />
      <text x={width - 4} y={yMid - 3} textAnchor="end"
            fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="DM Sans">50</text>
      {pmi.map((v, i) => {
        const x = i * (bw + 2);
        const yTop = height - 14 - ((v - min) / (max - min)) * (height - 24);
        const above = v >= mid;
        const top = Math.min(yMid, yTop);
        const h = Math.abs(yMid - yTop);
        return <rect key={i} x={x} y={top} width={bw} height={h}
                     fill={above ? 'rgba(125,214,137,0.55)' : color}
                     opacity={0.78} rx={1} />;
      })}
      <text x={4} y={11} fill={color} fontSize="8"
            fontFamily="DM Sans" opacity={0.7}>Mfg PMI · contraction</text>
    </svg>
  );
};

// Yearly bars of regulatory actions — "government crackdown / ban risk"
export const CrackdownEventsChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const data = [
    { y: '21', n: 2 },
    { y: '22', n: 4 },
    { y: '23', n: 6 },
    { y: '24', n: 3 },
    { y: '25', n: 4 },
    { y: '26', n: 5 },
  ];
  const max = 8;
  const bw = Math.floor((width - (data.length - 1) * 6) / data.length);
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = (d.n / max) * (height - 18);
        const x = i * (bw + 6);
        const y = height - 14 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={barH} rx={2}
                  fill={color} opacity={0.7} />
            <text x={x + bw / 2} y={y - 3} textAnchor="middle"
                  fill={color} fontSize="7.5" fontFamily="DM Sans" opacity={0.85}>{d.n}</text>
            <text x={x + bw / 2} y={height - 2} textAnchor="middle"
                  fill={color} fontSize="7.5" fontFamily="DM Sans" opacity={0.5}>{d.y}</text>
          </g>
        );
      })}
      <text x={4} y={11} fill={color} fontSize="8"
            fontFamily="DM Sans" opacity={0.7}>Reg actions / yr</text>
    </svg>
  );
};

// Distant-future timeline — "quantum computing narrative"
export const QuantumHorizonChart: React.FC<VizProps> = ({ color, width = 200, height = 60 }) => {
  const today = 2026;
  const horizon = 2040;
  const span = horizon - today + 4;
  const todayX = (4 / span) * (width - 16) + 8;
  const qcX = ((horizon - today + 4) / span) * (width - 16) + 8;
  const id = `qcGrad-${sId(color)}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <line x1={8} y1={height / 2 + 4} x2={width - 8} y2={height / 2 + 4}
            stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <rect x={todayX} y={height / 2} width={qcX - todayX} height={8}
            fill={`url(#${id})`} />
      {/* today */}
      <circle cx={todayX} cy={height / 2 + 4} r={4} fill="rgba(255,255,255,0.65)" />
      <text x={todayX} y={height / 2 - 4} textAnchor="middle"
            fill="rgba(255,255,255,0.65)" fontSize="8" fontFamily="DM Sans">today</text>
      {/* QC threat */}
      <circle cx={qcX} cy={height / 2 + 4} r={5} fill={color} opacity={0.9} />
      <circle cx={qcX} cy={height / 2 + 4} r={9} fill={color} opacity={0.18} />
      <text x={qcX} y={height / 2 - 4} textAnchor="end"
            fill={color} fontSize="8" fontFamily="DM Sans" fontWeight="600">QC ~2040</text>
      <text x={qcX} y={height - 4} textAnchor="end"
            fill={color} fontSize="7.5" fontFamily="DM Sans" opacity={0.6}>practical</text>
      <text x={4} y={11} fill={color} fontSize="8" fontFamily="DM Sans" opacity={0.7}>Horizon risk</text>
    </svg>
  );
};

// ─── Driver text → viz lookup ─────────────────────────────────────────────

/**
 * Pick the correct mini-viz for a driver based on its text. Returns null
 * for drivers we don't have a chart for (caller renders a plain pill).
 */
export function getDriverViz(
  driverText: string,
  color: string,
): React.ReactElement | null {
  const t = driverText.toLowerCase();

  // Gold
  if (t.includes('cyclic') || t.includes('ath pattern')) return <GoldCyclePeakChart color={color} />;
  if (t.includes('war') || t.includes('geopolitical')) return <GeopoliticalEventsChart color={color} />;
  // De-dollarization tested BEFORE 'inflation hedge' so the split entries
  // route to the right chart even if a future driver text combines both.
  if (t.includes('de-dollar') || t.includes('dedollar')) return <BarComparison color={color} bars={[
    { label: 'BRICS reserves', value: 0.55, max: 1 },
    { label: 'USD share',      value: 0.38, max: 1 },
  ]} />;
  if (t.includes('inflation') && t.includes('hedge')) return <CPIChart color={color} />;
  if (t.includes('central bank')) return <AccumulationChart color={color} />;
  if (t.includes('weak us dollar') || t.includes('dxy')) return <DXYChart color={color} />;
  if (t.includes('strong us dollar')) return <DXYChart color={color} />;
  if (t.includes('cooling inflation')) return <CPIChart color={color} />;
  // Newly mapped — previously fell through to text-only card.
  if (t.includes('prolonged consolidation')) return <ConsolidationChart color={color} />;
  if (t.includes('risk-on')) return <RiskRotationChart color={color} />;
  if (t.includes('rising interest rates') || t.includes('hawkish')) return <RatesStepChart color={color} />;

  // Silver
  if (t.includes('supply deficit')) return <SupplyDemandChart color={color} />;
  if (t.includes('ai') || t.includes('data center')) return <AIDataCenterChart color={color} />;
  if (t.includes('solar') || t.includes('ev battery')) return <SolarDemandChart color={color} />;
  if (t.includes('follows gold') || t.includes('gold bull')) return <SilverFollowsGoldChart color={color} />;
  if (t.includes('high volatility')) return <VolatilityChart color={color} />;
  if (t.includes('profit-taking') || t.includes('parabolic')) return <DrawdownChart color={color} />;
  // Newly mapped silver drivers.
  if (t.includes('dual store')) return <DualPillarChart color={color} />;
  if (t.includes('narrative exaggeration')) return <SentimentSpikeChart color={color} />;
  if (t.includes('gold consolidation')) return <LagDivergenceChart color={color} />;
  if (t.includes('industrial slowdown')) return <PMIContractionChart color={color} />;

  // Bitcoin
  if (t.includes('halving') || t.includes('4-year')) return <HalvingCycleChart color={color} />;
  if (t.includes('m2') || t.includes('rate cuts')) return <M2Chart color={color} />;
  if (t.includes('etf') || t.includes('institutional')) return <ETFFlowChart color={color} />;
  if (t.includes('government treasury') || t.includes('strategic')) return <StrategicReserveChart color={color} />;
  if (t.includes('drawdown') || t.includes('70%')) return <DrawdownChart color={color} />;
  if (t.includes('fud') || t.includes('macro shock')) return <VolatilityChart color={color} />;
  if (t.includes('falling dxy')) return <DXYChart color={color} />;
  // Newly mapped bitcoin drivers.
  if (t.includes('crackdown') || t.includes('ban risk')) return <CrackdownEventsChart color={color} />;
  if (t.includes('quantum')) return <QuantumHorizonChart color={color} />;

  return null;
}
