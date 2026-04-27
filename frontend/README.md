```
src/
├── App.tsx                       (≈30 lines — just routes + chart-tab early return)
├── main.tsx
├── pages/                        (one file per route)
│   ├── AssetPage.tsx             /app/asset  (NEW — 3D bullion scene extracted)
│   ├── IntelligencePage.tsx      /app/intel
│   ├── CapitalFlowPage.tsx       /app/capflow
│   ├── ChatPage.tsx              /app/smart_asset
│   ├── ChartPage.tsx             ?chart=<asset> standalone tab
│   └── MarketingLanding.tsx      /
├── components/                   (reusable UI)
│   ├── AppShell.tsx              (NEW — owns shared state, header + page switch)
│   ├── MarketingHeader.tsx
│   └── (3D primitives: GoldBullion, SilverBullion, BitcoinCuboid, Tether, …)
└── lib/
    ├── routes.ts                 (NEW — PageId + PATH_TO_PAGE)
    ├── marketData.ts
    ├── usePrices.ts
    └── (sounds, cryptoLogos, capitalFlowData)
```
