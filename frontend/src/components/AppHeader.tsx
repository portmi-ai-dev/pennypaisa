import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { openChartTab, type AssetKey, type Prices } from '../lib/marketData';

interface NavLink {
  label: string;
  to: string;
  hasMenu?: boolean;
}

const NAV_APP: NavLink[] = [
  { label: 'Capital Flow', to: '/capflow' },
  { label: 'Intelligence', to: '/intel', hasMenu: true },
  { label: 'Assets', to: '/asset' },
  { label: 'Smart Assets', to: '/smart_asset', hasMenu: true },
];

interface SubmenuOption {
  label: string;
  asset: string;
  accent: string;
  tagline?: string;
}

const INTEL_SUBMENU: SubmenuOption[] = [
  { label: 'Gold', asset: 'gold', accent: '#d4a843' },
  { label: 'Silver', asset: 'silver', accent: '#b8c4cc' },
  { label: 'Bitcoin', asset: 'btc', accent: '#f7931a' },
];

const SMART_SUBMENU: SubmenuOption[] = [
  { label: 'Gold', asset: 'gold', accent: '#d4a843' },
  { label: 'Silver', asset: 'silver', accent: '#b8c4cc' },
  { label: 'Bitcoin', asset: 'btc', accent: '#f7931a' },
  { label: 'Roundtable', asset: 'roundtable', accent: '#9b72cf', tagline: 'All three in conversation' },
];

const PillItem: React.FC<{ item: NavLink; active: boolean }> = ({ item, active }) => {
  const [hover, setHover] = React.useState(false);
  const bg = active
    ? 'rgba(255,255,255,0.10)'
    : hover
      ? 'rgba(255,255,255,0.06)'
      : 'transparent';
  const color = active || hover ? '#f3ecdc' : 'rgba(255,255,255,0.78)';

  return (
    <Link
      to={item.to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 14px',
        borderRadius: 999,
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color,
        textDecoration: 'none',
        transition: 'color 0.15s, background 0.15s',
        background: bg,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {item.label}
      {item.hasMenu && (
        <ChevronDown
          size={14}
          strokeWidth={2}
          style={{
            opacity: 0.6,
            transform: hover ? 'translateY(1px)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      )}
    </Link>
  );
};

const PillMenu: React.FC<{
  item: NavLink;
  active: boolean;
  options: SubmenuOption[];
}> = ({ item, active, options }) => {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);
  const handleEnter = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  const bg = active
    ? 'rgba(255,255,255,0.10)'
    : open
      ? 'rgba(255,255,255,0.06)'
      : 'transparent';
  const color = active || open ? '#f3ecdc' : 'rgba(255,255,255,0.78)';

  return (
    <div onMouseEnter={handleEnter} onMouseLeave={handleLeave} style={{ position: 'relative' }}>
      <Link
        to={item.to}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '8px 14px',
          borderRadius: 999,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          color,
          textDecoration: 'none',
          transition: 'color 0.15s, background 0.15s',
          background: bg,
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
        <ChevronDown
          size={14}
          strokeWidth={2}
          style={{
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s',
          }}
        />
      </Link>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 220,
            padding: 8,
            borderRadius: 14,
            background: 'rgba(14,14,22,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow:
              '0 14px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {options.map((o) => (
            <Link
              key={o.asset}
              to={`${item.to}?asset=${o.asset}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                textDecoration: 'none',
                color: '#e8e0d0',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = 'transparent')
              }
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: o.accent,
                  boxShadow: `0 0 8px ${o.accent}66`,
                  flexShrink: 0,
                }}
              />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.2 }}>
                  {o.label}
                </span>
                {o.tagline && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.45)',
                      marginTop: 2,
                    }}
                  >
                    {o.tagline}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

interface Props {
  prices?: Prices | null;
  loading?: boolean;
}

const getPublicSiteHref = (): string => {
  if (typeof window === 'undefined') return '/';
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return '/';
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[0] === 'app') {
    return `${protocol}//${parts.slice(1).join('.')}`;
  }
  return `${protocol}//${hostname}`;
};

export const AppHeader: React.FC<Props> = ({ prices, loading }) => {
  const { pathname } = useLocation();
  const publicHref = React.useMemo(getPublicSiteHref, []);

  const tickers: Array<{ sym: string; v: string; c: number; col: string; asset: AssetKey }> | null =
    prices && [
      {
        sym: 'XAU',
        v: `$${prices.gold.price.toFixed(0)}`,
        c: prices.gold.changePercent24h,
        col: '#d4a843',
        asset: 'gold',
      },
      {
        sym: 'XAG',
        v: `$${prices.silver.price.toFixed(2)}`,
        c: prices.silver.changePercent24h,
        col: '#b8c4cc',
        asset: 'silver',
      },
      {
        sym: 'BTC',
        v: `$${prices.bitcoin.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        c: prices.bitcoin.changePercent24h,
        col: '#f7931a',
        asset: 'bitcoin',
      },
    ];

  const showStatus = prices !== undefined;

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 28px',
        gap: 20,
        background:
          'linear-gradient(180deg, rgba(6,6,14,0.65) 0%, rgba(6,6,14,0) 100%)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        flexShrink: 0,
        pointerEvents: 'none',
      }}
    >
      <a
        href={publicHref}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          flexShrink: 0,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ width: 28, height: 28, position: 'relative' }}>
          <div
            style={{
              width: 17,
              height: 17,
              background: '#d4a843',
              borderRadius: 3,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          />
          <div
            style={{
              width: 17,
              height: 17,
              background: '#b8c4cc',
              borderRadius: 3,
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
            fontSize: 24,
            fontWeight: 400,
            color: '#e8e0d0',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
          }}
        >
          gilver<span style={{ color: '#d4a843' }}>.</span>ai
        </span>
      </a>

      <nav
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 8px',
          borderRadius: 999,
          background: 'rgba(20,20,30,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
          pointerEvents: 'auto',
        }}
      >
        {NAV_APP.map((item) => {
          const isActive = pathname === item.to;
          if (item.hasMenu && item.label === 'Intelligence') {
            return (
              <PillMenu
                key={item.label}
                item={item}
                active={isActive}
                options={INTEL_SUBMENU}
              />
            );
          }
          if (item.hasMenu && item.label === 'Smart Assets') {
            return (
              <PillMenu
                key={item.label}
                item={item}
                active={isActive}
                options={SMART_SUBMENU}
              />
            );
          }
          return <PillItem key={item.label} item={item} active={isActive} />;
        })}
      </nav>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
          pointerEvents: 'auto',
        }}
      >
        {tickers && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {tickers.map((t) => (
              <button
                key={t.sym}
                onClick={() => openChartTab(t.asset)}
                title={`Open ${t.sym} candlestick chart in a new tab`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 6px',
                  margin: '0 -6px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <span
                  style={{ fontFamily: 'DM Sans', fontSize: 9, letterSpacing: 2, color: t.col }}
                >
                  {t.sym}
                </span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#d8d0c0' }}>
                  {t.v}
                </span>
                <span
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 10,
                    color:
                      t.c > 0
                        ? '#4caf50'
                        : t.c < 0
                          ? '#ef5350'
                          : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {t.c > 0 ? '+' : ''}
                  {t.c.toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
        )}

        {showStatus && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: loading ? '#f5d78e' : '#4caf50',
                boxShadow: loading ? '0 0 5px #f5d78e88' : '0 0 5px #4caf5088',
                animation: loading ? 'gilverHdrPulse 1s infinite' : 'none',
              }}
            />
            <span
              style={{
                fontFamily: 'DM Sans',
                fontSize: 9,
                letterSpacing: 1.5,
                color: 'rgba(255,255,255,0.35)',
                textTransform: 'uppercase',
              }}
            >
              {loading ? 'Syncing' : ''}
            </span>
          </div>
        )}
      </div>

      <style>{`@keyframes gilverHdrPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>
    </header>
  );
};
