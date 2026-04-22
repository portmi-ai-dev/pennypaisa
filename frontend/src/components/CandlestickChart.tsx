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

interface CandlestickChartProps {
  data: ChartData[];
  title: string;
  isVisible: boolean;
  onClose: () => void;
  color?: string;
  isFallback?: boolean;
  isLoading?: boolean;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ 
  data, 
  title, 
  isVisible, 
  onClose,
  color = '#FFD700',
  isFallback = false,
  isLoading = false
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
    const dates = data.map(item => {
      const d = new Date(item.time * 1000);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
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
          const p = params[0];
          const [open, close, low, high] = p.data as number[];
          const format = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
          return `
            <div style="padding: 4px;">
              <div style="color: ${color}; font-weight: bold; margin-bottom: 4px;">${p.name}</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px;">
                <span style="color: rgba(255,255,255,0.4)">OPEN</span> <span>${format(open)}</span>
                <span style="color: rgba(255,255,255,0.4)">CLOSE</span> <span>${format(close)}</span>
                <span style="color: rgba(255,255,255,0.4)">LOW</span> <span>${format(low)}</span>
                <span style="color: rgba(255,255,255,0.4)">HIGH</span> <span>${format(high)}</span>
              </div>
            </div>
          `;
        }
      },
      grid: {
        left: '10%',
        right: '5%',
        bottom: '15%',
        top: '10%'
      },
      xAxis: {
        type: 'category',
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
        axisLabel: { color: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'JetBrains Mono' },
        splitLine: { show: false }
      },
      yAxis: {
        scale: true,
        axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
        axisLabel: { 
          color: 'rgba(255, 255, 255, 0.3)', 
          fontSize: 10, 
          fontFamily: 'JetBrains Mono',
          formatter: (value: number) => `$${value.toLocaleString()}`
        },
        splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
      },
      series: [
        {
          type: 'candlestick',
          data: values,
          itemStyle: {
            color: color,
            color0: '#ef5350',
            borderColor: color,
            borderColor0: '#ef5350'
          },
          emphasis: {
            itemStyle: {
              borderWidth: 2
            }
          }
        }
      ],
      animationDuration: 1000
    };
  }, [data, color]);

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
                {isFallback && (
                  <span className="text-[9px] font-mono uppercase tracking-widest text-white/40 border border-white/10 px-2 py-1 rounded-full">
                    Fallback Data
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
          <div className="flex-1 w-full relative">
            {isLoading && data.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-4 animate-pulse">
                  <Activity size={24} className="text-white/20" />
                </div>
                <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase mb-2">Loading Candles</span>
                <p className="text-[9px] text-white/20 font-mono max-w-[200px]">
                  Requesting the latest OHLC history from CoinGecko.
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
                  Aggregating CoinGecko OHLC data. If this persists, the public API rate limit may have been reached.
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