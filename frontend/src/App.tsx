import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AppShell } from './components/AppShell';
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
      <Route path="/" element={<Navigate to="/capflow" replace />} />
      <Route path="/asset" element={<AppShell />} />
      <Route path="/intel" element={<AppShell />} />
      <Route path="/capflow" element={<AppShell />} />
      <Route path="/smart_asset" element={<AppShell />} />
      <Route path="/app" element={<Navigate to="/capflow" replace />} />
      <Route path="/app/asset" element={<Navigate to="/asset" replace />} />
      <Route path="/app/intel" element={<Navigate to="/intel" replace />} />
      <Route path="/app/capflow" element={<Navigate to="/capflow" replace />} />
      <Route path="/app/smart_asset" element={<Navigate to="/smart_asset" replace />} />
      <Route path="*" element={<Navigate to="/capflow" replace />} />
    </Routes>
  );
}
