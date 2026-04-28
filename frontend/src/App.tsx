import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { MarketingLanding } from './pages/MarketingLanding';
import { ChartPage } from './pages/ChartPage';
import { type AssetKey } from './lib/marketData';

// If the URL contains ?chart=<asset>, this tab is a dedicated full-screen
// candlestick view. Resolved once at module load — the URL doesn't change
// for the lifetime of the tab, so we don't need a hook for this.
const CHART_TAB_ASSET: AssetKey | null = (() => {
  if (typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('chart');
  if (param === 'gold' || param === 'silver' || param === 'bitcoin') return param;
  return null;
})();

export default function App() {
  // Standalone chart tab: detected at module load before any router state.
  // The chart tab opens via window.open(...?chart=<asset>) and replaces the
  // whole document — never participates in routing.
  if (CHART_TAB_ASSET) {
    return <ChartPage asset={CHART_TAB_ASSET} />;
  }

  return (
    <Routes>
      <Route path="/" element={<MarketingLanding />} />
      <Route path="/app" element={<Navigate to="/app/capflow" replace />} />
      <Route path="/app/asset" element={<AppShell />} />
      <Route path="/app/intel" element={<AppShell />} />
      <Route path="/app/capflow" element={<AppShell />} />
      <Route path="/app/smart_asset" element={<AppShell />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
