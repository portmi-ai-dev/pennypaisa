# UI change log — URL routing + marketing landing + unified navbar

## Final route map

| Path                | Page                                    | Component         |
| ------------------- | --------------------------------------- | ----------------- |
| `/`                 | Marketing landing                       | `MarketingLanding` |
| `/app`              | redirects to `/app/asset`               |                   |
| `/app/asset`        | 3D bullion scene (was "landing")        | `AppShell`        |
| `/app/intel`        | Intelligence                            | `AppShell`        |
| `/app/capflow`      | Capital Flow                            | `AppShell`        |
| `/app/smart_asset`  | Smart Assets / Chat                     | `AppShell`        |
| anything else       | redirects to `/`                        |                   |

The `/app` prefix namespaces product surfaces away from future top-level pages
(`/login`, `/pricing`, `/blog`, …) so adding them later is a one-line route
addition rather than a path collision.

## What changed

### 1. URL-based navigation

The app previously used a single `page` React state in `App.tsx`, persisted to
`localStorage` under `gilver_page`, with all four product pages mounted at once
and toggled via `display: block | none`. The URL never changed.

This is now replaced with a **react-router-dom v7** routing layer. The URL is
the source of truth; the four product pages are routes you can deep-link to,
share, and use the back button on.

### 2. WebGL canvas preservation

The 3D Three.js `<Canvas>` is expensive to initialize and re-creating it on
every navigation would re-trigger the loader. To avoid this, all four product
routes (`/app/asset`, `/app/intel`, `/app/capflow`, `/app/smart_asset`) render
the **same `AppShell` component**. The shell reads `useLocation()` to know
which page is active and uses the original `display: block | none` trick
internally — so the canvas, market-data fetches, and sentiment cache stay
mounted across in-app navigation.

The marketing route (`/`) is a separate, lightweight tree with no canvas.

### 3. New marketing landing at `/`

`src/components/MarketingLanding.tsx` — a hero + feature-grid + CTA page that
showcases the four pillars of the product. Pure DOM (no 3D), so it loads fast.

Sections:
- **Hero**: live indicator chip, oversized serif headline, subhead, two CTAs
  (`Enter the terminal` → `/app/asset`, `How it works` → anchor to pillars).
- **Pillars grid**: 4 cards — Assets, Capital Flow, Intelligence, Smart Assets
  — each linking to its `/app/...` route, with the brand accent color of that
  pillar.
- **Closing CTA**: serif headline + `Launch terminal` button.
- **Footer**.

Animations via `motion/react` (already a dependency).

### 4. Unified navbar — `MarketingHeader`

The old `AppHeader` is **gone**. A single `MarketingHeader` component
(`src/components/MarketingHeader.tsx`) renders on every route. Two variants
are toggled via a `variant` prop (which also picks the layout/position):

- **`variant="marketing"`** (used on `/`) — `position: fixed`, gradient
  background fading to transparent. Sits over the hero. Pill nav contains a
  single **`App ▾` hover-dropdown** that opens to reveal the four product
  surfaces (Assets, Capital Flow, Intelligence, Smart Assets), followed by
  `Docs` and `Pricing`. Right cluster shows tickers + live status + `Sign In`
  + `Sign Up`.
- **`variant="app"`** (used by `AppShell`) — `position: relative`, solid
  `rgba(4,4,10,0.96)` background, heavier blur, bottom border. Reserves
  layout space at the top of the shell so product content isn't covered. Pill
  nav contains all four product surfaces as individual items
  (`Assets / Capital Flow / Intelligence ▾ / Smart Assets ▾ / Docs /
  Pricing`); the active pill is highlighted via `useLocation()`. Right
  cluster shows tickers + live status only — **no `Sign In` / `Sign Up`**
  inside the product.

Layout (consistent across both variants):

- **Left**: gilver.ai logo (links to `/`).
- **Center pill** (absolutely centered so the right cluster's width can grow
  without shifting it).
- **Right cluster**: tickers (`XAU / XAG / BTC` with price + 24h %, each
  clickable to open the candlestick chart in a new tab) → live/syncing status
  pill → auth buttons (marketing only).

#### `App ▾` dropdown (marketing only)

Hover-opens a frosted card listing each product surface with its accent dot
and a one-line tagline. Pointer departures use a 120ms close delay so users
can travel from the trigger into the panel without it collapsing.

#### Live tickers on `/`

The marketing page now fetches prices via the new `usePrices` hook
(`src/lib/usePrices.ts`) and forwards them to `MarketingHeader`, so the public
landing also shows `XAU / XAG / BTC` + the green Live indicator. The hook is a
lightweight wrapper around `/api/prices` that returns just a `Prices` object —
the in-app shell still owns its richer state (BTC market cap, dominance,
volume, weekly %) since it needs those derived fields for the 3D scene.

### 5. AppShell layout

`<MarketingHeader floating={false} prices={prices} loading={isLoading} />` sits
at the top of the `AppShell` flex container, replacing the old `<AppHeader />`.
Everything below is unchanged: `<main>` with `flex: 1; overflow: hidden`, four
absolutely-positioned page containers toggled by `display`.

`localStorage.setItem('gilver_page', ...)` was removed — the URL replaces it.

### 6. Chart tab (`?chart=<asset>`) — untouched

The "open candlestick in new tab" path checks for `?chart=…` at module load,
before the router mounts, and renders `ChartPage` standalone. Behavior is
identical to before. Tickers in the new header still call `openChartTab(asset)`.

## Files

**Added**
- `frontend/src/components/MarketingLanding.tsx`
- `frontend/src/components/MarketingHeader.tsx`
- `frontend/src/lib/usePrices.ts`

**Removed**
- `frontend/src/components/AppHeader.tsx` (replaced by `MarketingHeader`)

**Modified**
- `frontend/src/main.tsx` — wraps `<App />` in `<BrowserRouter>`.
- `frontend/src/App.tsx`
  - `AppShell` reads URL via `useLocation`; `localStorage` page persistence
    removed.
  - `PageId` moved here (was in `AppHeader`); `PATH_TO_PAGE` / `PAGE_TO_PATH`
    use the `/app/*` prefix.
  - Default `App` exports a `<Routes>` tree with `/`, `/app`, `/app/asset`,
    `/app/intel`, `/app/capflow`, `/app/smart_asset` and a `*` redirect to `/`.
  - Renders `<MarketingHeader floating={false} prices={...} loading={...} />`
    instead of the deleted `AppHeader`.
- `frontend/package.json` — added `react-router-dom@^7`.

## Manual test checklist

- [ ] `/` renders the marketing page with the centered pill nav.
- [ ] Marketing pill shows `App ▾ / Docs / Pricing`. Hovering `App` reveals
      the four product surfaces; clicking each lands on its `/app/*` route.
- [ ] `/` shows live tickers (XAU / XAG / BTC) + green `Live` indicator
      between the pill and `Sign In`.
- [ ] In-app navbar (`/app/*`) shows the full per-page pill (`Assets / Capital
      Flow / Intelligence ▾ / Smart Assets ▾ / Docs / Pricing`) with active
      highlighting, plus tickers + live status, and **no** `Sign In`/`Sign Up`.
- [ ] Logo (in either header) returns to `/`.
- [ ] Tickers in either navbar open the candlestick chart in a new tab.
- [ ] At `/app/asset`, the 3D bullion scene renders. Switching to
      `/app/intel`, `/app/capflow`, `/app/smart_asset` and back does **not**
      re-trigger the "Synchronizing" loader (canvas stays mounted).
- [ ] Browser back/forward buttons walk the route history correctly.
- [ ] `/app` redirects to `/app/asset`.
- [ ] Unknown path (e.g. `/foo`, old `/asset`) redirects to `/`.
- [ ] `/app/asset?chart=gold` still opens the standalone candlestick view.
