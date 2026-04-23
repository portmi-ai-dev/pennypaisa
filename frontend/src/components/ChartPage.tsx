import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { ASSET_CONFIG, assetToBackend, type AssetKey } from '../lib/marketData';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Interval = '1m' | '5m' | '15m' | '1h' | '1d' | '1w' | '1mo';

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '1d', '1w', '1mo'];
const BULL = '#22c55e';
const BEAR = '#ef4444';

interface Props {
  asset: AssetKey;
}

interface SnapshotPrice {
  price: number;
  changePercent24h: number;
  change24h?: number;
}

export const ChartPage: React.FC<Props> = ({ asset }) => {
  const cfg = ASSET_CONFIG[asset];
  const [interval, setInterval] = useState<Interval>('1d');
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotPrice | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const chartRef = useRef<ReactECharts>(null);

  // Set the document title so the browser tab is meaningful
  useEffect(() => {
    document.title = `${cfg.sym} · ${cfg.name} — Gilver.ai`;
  }, [cfg.sym, cfg.name]);

  // Fetch historical candles whenever asset or interval changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const slug = assetToBackend(asset);
        const res = await fetch(`/api/history/${slug}?interval=${interval}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        if (cancelled) return;
        if (!Array.isArray(json)) {
          setError('No historical data available.');
          setData([]);
        } else {
          // Backend may return [{ error: '...' }]
          const first = json[0] as { error?: string } | undefined;
          if (first && typeof first === 'object' && 'error' in first) {
            setError(String(first.error));
            setData([]);
          } else {
            setData(json as Candle[]);
          }
        }
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Failed to load chart');
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    // Auto-refresh intraday intervals more aggressively
    const refreshMs =
      interval === '1m' ? 15_000 : interval === '5m' || interval === '15m' ? 30_000 : 60_000;
    const id = window.setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [asset, interval]);

  // Fetch the current spot snapshot for the header pill (independent from candles)
  useEffect(() => {
    let cancelled = false;
    const fetchSnapshot = async () => {
      try {
        const res = await fetch('/api/prices');
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const data = (await res.json()) as Record<string, number | undefined>;
        if (cancelled) return;
        const map: Record<AssetKey, SnapshotPrice | null> = {
          gold: data.gold
            ? { price: Number(data.gold), changePercent24h: Number(data.goldChangePercent || 0), change24h: Number(data.goldChange || 0) }
            : null,
          silver: data.silver
            ? { price: Number(data.silver), changePercent24h: Number(data.silverChangePercent || 0), change24h: Number(data.silverChange || 0) }
            : null,
          bitcoin: data.btc
            ? { price: Number(data.btc), changePercent24h: Number(data.btcChangePercent || 0), change24h: Number(data.btcChange || 0) }
            : null,
        };
        setSnapshot(map[asset]);
      } catch {
        /* ignore */
      }
    };
    void fetchSnapshot();
    const id = window.setInterval(fetchSnapshot, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [asset]);

  // Resize chart when window resizes
  useEffect(() => {
    const onResize = () => chartRef.current?.getEchartsInstance().resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const options = useMemo(() => {
    if (data.length === 0) return {};

    const isIntraday = interval === '1m' || interval === '5m' || interval === '15m' || interval === '1h';
    const isMonthly = interval === '1mo';
    const dates = data.map((c) => {
      const d = new Date(c.time * 1000);
      const yyyy = d.getFullYear();
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      if (isIntraday) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mi = d.getMinutes().toString().padStart(2, '0');
        return `${mm}/${dd} ${hh}:${mi}`;
      }
      if (isMonthly) return `${yyyy}-${mm}`;
      return `${yyyy}-${mm}-${dd}`;
    });
    // ECharts candlestick series expects [open, close, low, high]
    const values = data.map((c) => [c.open, c.close, c.low, c.high]);
    const closes = data.map((c) => c.close);

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: { color: 'rgba(255,255,255,0.18)', width: 1, type: 'dashed' },
        },
        backgroundColor: 'rgba(6,6,14,0.92)',
        borderColor: cfg.colorBorder,
        borderWidth: 1,
        textStyle: { color: '#e8e0d0', fontFamily: 'JetBrains Mono', fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const candle = Array.isArray(params)
            ? params.find((e: { seriesType: string }) => e.seriesType === 'candlestick')
            : params;
          if (!candle || !Array.isArray(candle.data)) return '';
          const ohlc = (candle.data as number[]).slice(-4);
          const [open, close, low, high] = ohlc;
          const isBull = close >= open;
          const accent = isBull ? BULL : BEAR;
          const fmt = (v: number) =>
            asset === 'bitcoin'
              ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : `$${v.toFixed(2)}`;
          const change = close - open;
          const pct = open ? (change / open) * 100 : 0;
          return `
            <div style="padding:6px;min-width:170px;">
              <div style="color:${cfg.color};font-weight:600;margin-bottom:6px;font-family:'DM Sans',sans-serif;letter-spacing:0.06em;text-transform:uppercase;font-size:10px;">${candle.name}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;font-size:11px;">
                <span style="color:rgba(255,255,255,0.4)">OPEN</span><span>${fmt(open)}</span>
                <span style="color:rgba(255,255,255,0.4)">HIGH</span><span>${fmt(high)}</span>
                <span style="color:rgba(255,255,255,0.4)">LOW</span><span>${fmt(low)}</span>
                <span style="color:rgba(255,255,255,0.4)">CLOSE</span><span>${fmt(close)}</span>
              </div>
              <div style="margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:${accent};">
                ${isBull ? '▲' : '▼'} ${fmt(Math.abs(change))} (${pct.toFixed(2)}%)
              </div>
            </div>`;
        },
      },
      grid: { left: 64, right: 28, top: 30, bottom: 70 },
      dataZoom: [
        {
          type: 'inside',
          start: Math.max(0, 100 - (80 / Math.max(values.length, 1)) * 100),
          end: 100,
          minValueSpan: 5,
        },
        {
          type: 'slider',
          show: true,
          height: 18,
          bottom: 28,
          start: Math.max(0, 100 - (80 / Math.max(values.length, 1)) * 100),
          end: 100,
          backgroundColor: 'rgba(255,255,255,0.02)',
          fillerColor: 'rgba(255,255,255,0.06)',
          borderColor: 'rgba(255,255,255,0.04)',
          handleStyle: { color: 'rgba(255,255,255,0.45)' },
          textStyle: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'JetBrains Mono' },
          dataBackground: {
            lineStyle: { color: 'rgba(255,255,255,0.12)' },
            areaStyle: { color: 'rgba(255,255,255,0.03)' },
          },
        },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          boundaryGap: true,
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
          axisTick: { show: false },
          axisLabel: {
            color: 'rgba(255,255,255,0.35)',
            fontSize: 10,
            fontFamily: 'JetBrains Mono',
            hideOverlap: true,
          },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          position: 'right',
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
          axisLabel: {
            color: 'rgba(255,255,255,0.35)',
            fontSize: 10,
            fontFamily: 'JetBrains Mono',
            formatter: (v: number) =>
              asset === 'bitcoin'
                ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : `$${v.toFixed(2)}`,
          },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        },
      ],
      series: [
        {
          type: 'candlestick',
          data: values,
          barMaxWidth: 14,
          itemStyle: {
            color: BULL,
            color0: BEAR,
            borderColor: BULL,
            borderColor0: BEAR,
            borderWidth: 1,
          },
          emphasis: { itemStyle: { borderWidth: 2 } },
        },
        {
          type: 'line',
          data: closes,
          showSymbol: false,
          smooth: true,
          lineStyle: { color: cfg.color, width: 1, opacity: 0.45 },
          z: 1,
        },
      ],
    };
  }, [data, interval, asset, cfg]);

  const ohlcLatest = data[data.length - 1];
  const heroPrice =
    snapshot?.price ?? ohlcLatest?.close ?? 0;
  const heroChangePct = snapshot?.changePercent24h ?? 0;

  const fmtHero = (v: number) =>
    asset === 'bitcoin'
      ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${v.toFixed(2)}`;

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#06060e',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'DM Sans, sans-serif',
        color: '#e8e0d0',
      }}
    >
      {/* Atmospheric halo behind chart */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `radial-gradient(ellipse 70% 50% at 50% 30%, ${cfg.colorDim} 0%, transparent 70%)`,
        }}
      />

      {/* Header */}
      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(4,4,10,0.82)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* gilver.ai mini-logo */}
          <a
            href={window.location.pathname}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: 'inherit',
              opacity: 0.78,
            }}
          >
            <div style={{ width: 22, height: 22, position: 'relative', flexShrink: 0 }}>
              <div
                style={{
                  width: 13,
                  height: 13,
                  background: '#d4a843',
                  borderRadius: 2,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              />
              <div
                style={{
                  width: 13,
                  height: 13,
                  background: '#b8c4cc',
                  borderRadius: 2,
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  opacity: 0.88,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 16,
                color: '#e8e0d0',
                letterSpacing: 1,
              }}
            >
              gilver<span style={{ color: '#d4a843' }}>.</span>ai
            </span>
          </a>
          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.06)' }} />
          {/* Asset block */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 5,
              background: cfg.color,
              color: '#06060e',
              fontFamily: 'Cormorant Garamond, serif',
              fontWeight: 700,
              fontSize: asset === 'bitcoin' ? 18 : 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 18px ${cfg.color}55`,
            }}
          >
            {cfg.avatar}
          </div>
          <div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 22,
                fontWeight: 400,
                color: '#e8e0d0',
                lineHeight: 1.05,
              }}
            >
              {cfg.name}
              <span style={{ color: cfg.color, marginLeft: 8, fontSize: 13, letterSpacing: 2 }}>
                {cfg.sym}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: 'rgba(255,255,255,0.32)',
                textTransform: 'uppercase',
                marginTop: 3,
              }}
            >
              Candlestick · {interval} · OHLC
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 32,
                fontWeight: 300,
                lineHeight: 1,
                color: '#ece4d4',
              }}
            >
              {heroPrice ? fmtHero(heroPrice) : '—'}
            </div>
            <div
              style={{
                fontSize: 11,
                marginTop: 4,
                color: heroChangePct >= 0 ? '#7fc983' : '#ef8a87',
              }}
            >
              {heroChangePct >= 0 ? '▲' : '▼'} {Math.abs(heroChangePct).toFixed(2)}% · 24h
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 9px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 999,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: loading ? '#f5d78e' : '#4caf50',
                boxShadow: loading ? '0 0 6px #f5d78e88' : '0 0 6px #4caf5088',
                animation: loading ? 'gilverChartPulse 1s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>
              {loading ? 'Loading' : `Live · ${lastUpdated}`}
            </span>
          </div>
        </div>
      </header>

      {/* Interval picker */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          gap: 6,
          padding: '12px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0,
        }}
      >
        {INTERVALS.map((iv) => {
          const active = iv === interval;
          return (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              style={{
                padding: '6px 14px',
                background: active ? cfg.colorDim : 'transparent',
                border: `1px solid ${active ? cfg.colorBorder : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 4,
                color: active ? cfg.color : 'rgba(255,255,255,0.4)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {iv}
            </button>
          );
        })}
      </div>

      {/* Chart canvas */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          zIndex: 1,
          padding: '14px 18px 18px',
          minHeight: 0,
        }}
      >
        {loading && data.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: '2px solid rgba(255,255,255,0.08)',
                borderTopColor: cfg.color,
                borderRadius: '50%',
                animation: 'gilverChartSpin 1s linear infinite',
              }}
            />
            Streaming candles…
          </div>
        )}
        {error && data.length === 0 && !loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 8,
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
              padding: 24,
            }}
          >
            <div style={{ fontSize: 13, color: '#ef8a87' }}>Couldn't load candles</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{error}</div>
          </div>
        )}
        {data.length > 0 && (
          <ReactECharts
            ref={chartRef}
            option={options}
            notMerge={false}
            lazyUpdate
            style={{ width: '100%', height: '100%' }}
            theme="dark"
          />
        )}
      </div>

      <style>{`
        @keyframes gilverChartPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes gilverChartSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
