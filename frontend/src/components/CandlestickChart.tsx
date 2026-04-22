import React, { useMemo, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Activity } from 'lucide-react';

interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Interval = '1m' | '5m' | '15m' | '1h' | '1d' | '1w' | '1mo';

interface CandlestickChartProps {
  data: ChartData[];
  title: string;
  isVisible: boolean;
  onClose: () => void;
  color?: string;
  isFallback?: boolean;
  isLoading?: boolean;
  interval?: Interval;
  onIntervalChange?: (interval: Interval) => void;
}

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '1d', '1w', '1mo'];

const BULL_COLOR = '#22c55e';
const BEAR_COLOR = '#ef4444';

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  data,
  title,
  isVisible,
  onClose,
  color = '#FFD700',
  isFallback = false,
  isLoading = false,
  interval = '1d',
  onIntervalChange,
}) => {
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    if (!isVisible) return;

    const handleResize = () => {
      chartRef.current?.getEchartsInstance().resize();
    };

    const raf = requestAnimationFrame(handleResize);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, [isVisible]);
  const options = useMemo(() => {
    if (data.length === 0) return {};

    // ECharts Candlestick format: [open, close, low, high]
    const isIntraday = interval === '1m' || interval === '5m' || interval === '15m' || interval === '1h';
    const isMonthly = interval === '1mo';
    const dates = data.map(item => {
      const d = new Date(item.time * 1000);
      const yyyy = d.getFullYear();
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      if (isIntraday) {
        const hh = d.getHours().toString().padStart(2, '0');
        const mi = d.getMinutes().toString().padStart(2, '0');
        return `${mm}/${dd} ${hh}:${mi}`;
      }
      if (isMonthly) {
        return `${yyyy}-${mm}`;
      }
      return `${yyyy}-${mm}-${dd}`;
    });
    
    const values = data.map(item => [
      item.open,
      item.close,
      item.low,
      item.high
    ]);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.2)',
            width: 1,
            type: 'dashed'
          }
        },
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: color + '44',
        borderWidth: 1,
        textStyle: {
          color: '#fff',
          fontFamily: 'JetBrains Mono',
          fontSize: 10
        },
        formatter: (params: any) => {
          const candleParam = Array.isArray(params)
            ? params.find((entry: any) => entry.seriesType === 'candlestick')
            : params;
          if (!candleParam || !Array.isArray(candleParam.data)) return '';
          // ECharts may prepend the data index to params.data — use the last 4 entries as OCHL.
          const raw = candleParam.data as number[];
          const ohlc = raw.slice(-4);
          const [open, close, low, high] = ohlc;
          const isBull = close >= open;
          const accent = isBull ? BULL_COLOR : BEAR_COLOR;
          const format = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
          const change = close - open;
          const pct = open ? (change / open) * 100 : 0;
          return `
            <div style="padding: 4px; min-width: 150px;">
              <div style="color: ${color}; font-weight: bold; margin-bottom: 4px;">${candleParam.name}</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 10px;">
                <span style="color: rgba(255,255,255,0.4)">OPEN</span> <span>${format(open)}</span>
                <span style="color: rgba(255,255,255,0.4)">HIGH</span> <span>${format(high)}</span>
                <span style="color: rgba(255,255,255,0.4)">LOW</span> <span>${format(low)}</span>
                <span style="color: rgba(255,255,255,0.4)">CLOSE</span> <span>${format(close)}</span>
              </div>
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 10px; color: ${accent};">
                ${isBull ? '▲' : '▼'} ${format(Math.abs(change))} (${pct.toFixed(2)}%)
              </div>
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '5%',
        bottom: '20%',
        top: '8%'
      },
      dataZoom: [
        {
          type: 'inside',
          start: Math.max(0, 100 - (60 / Math.max(values.length, 1)) * 100),
          end: 100,
          zoomLock: false,
          minValueSpan: 5,
        },
        {
          type: 'slider',
          show: true,
          height: 16,
          bottom: 26,
          start: Math.max(0, 100 - (60 / Math.max(values.length, 1)) * 100),
          end: 100,
          backgroundColor: 'rgba(255,255,255,0.02)',
          fillerColor: 'rgba(255,255,255,0.08)',
          borderColor: 'rgba(255,255,255,0.05)',
          handleStyle: { color: 'rgba(255,255,255,0.5)' },
          textStyle: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'JetBrains Mono' },
          dataBackground: {
            lineStyle: { color: 'rgba(255,255,255,0.15)' },
            areaStyle: { color: 'rgba(255,255,255,0.04)' },
          },
        },
      ],
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
        axisTick: { show: false },
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.3)',
          fontSize: 10,
          fontFamily: 'JetBrains Mono',
          hideOverlap: true
        },
        splitLine: { show: false }
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
        axisLabel: {
          color: 'rgba(255, 255, 255, 0.3)',
          fontSize: 10,
          fontFamily: 'JetBrains Mono',
          formatter: (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      series: [
        {
          type: 'candlestick',
          data: values,
          barMaxWidth: 14,
          itemStyle: {
            color: BULL_COLOR,
            color0: BEAR_COLOR,
            borderColor: BULL_COLOR,
            borderColor0: BEAR_COLOR,
            borderWidth: 1
          },
          emphasis: {
            itemStyle: {
              borderWidth: 2
            }
          }
        }
      ],
      animationDuration: 400
    };
  }, [data, color, interval]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className="absolute left-8 top-8 w-1/3 h-1/2 z-[100] bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[2rem] overflow-hidden flex flex-col p-6 pointer-events-auto"
          style={{ boxShadow: `0 0 50px -20px ${color}44` }}
        >
          <div className="flex justify-between items-center mb-4">
            <div className="flex flex-col">
              <span className="text-[10px] tracking-[0.4em] text-white/30 uppercase font-mono mb-1">ECharts Intel</span>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-light text-white font-mono tracking-tight">{title}</h3>
                {isFallback ? (
                  <span className="text-[9px] font-mono uppercase tracking-widest text-white/40 border border-white/10 px-2 py-1 rounded-full">
                    Fallback Data
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-emerald-400/70 border border-emerald-400/20 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          {onIntervalChange && (
            <div className="flex gap-1 mb-3">
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  onClick={() => onIntervalChange(iv)}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest border transition-colors ${
                    interval === iv
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'bg-transparent border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                  }`}
                >
                  {iv}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 w-full relative">
            {isLoading && data.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-4 animate-pulse">
                  <Activity size={24} className="text-white/20" />
                </div>
                <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase mb-2">Loading Candles</span>
                <p className="text-[9px] text-white/20 font-mono max-w-[200px]">
                  Streaming live OHLC from {title.startsWith('Bitcoin') ? 'Binance' : 'Yahoo Finance'}.
                </p>
              </div>
            ) : data.length > 0 ? (
              <ReactECharts 
                ref={chartRef}
                option={options} 
                style={{ height: '100%', width: '100%' }}
                theme="dark"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-4 animate-pulse">
                  <Activity size={24} className="text-white/20" />
                </div>
                <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase mb-2">Market Sync in Progress</span>
                <p className="text-[9px] text-white/20 font-mono max-w-[200px]">
                  Aggregating live OHLC data. If this persists, the upstream feed may be temporarily unavailable.
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-4">
            <div className="flex flex-col">
              <span className="text-[8px] text-white/20 uppercase font-mono">Engine</span>
              <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase">Apache ECharts v5</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};