---
phase: 2
plan: 1
wave: 1
depends_on: []
files_modified:
  - .env
  - .env.example
  - server/package.json
  - server/src/providers/types.ts
  - server/src/providers/upstox.ts
  - server/src/providers/finnhub.ts
  - server/src/providers/forex.ts
  - server/src/providers/indices.ts
  - server/src/providers/router.ts
  - server/src/websocket.ts
  - server/src/routes/market.ts
  - server/src/index.ts
  - web/package.json
  - web/lib/api.ts
  - web/lib/ws.ts
  - web/lib/indicators.ts
  - web/lib/patterns.ts
  - web/store/terminal.ts
  - web/components/CommandPalette.tsx
  - web/components/TopBar.tsx
  - web/components/widgets/ChartWidget.tsx
  - web/components/widgets/WatchlistWidget.tsx
  - web/components/widgets/OptionsWidget.tsx
autonomous: true
must_haves:
  truths:
    - "Upstox and Finnhub credentials securely stored in backend .env"
    - "Backend provides WebSocket server at /ws with subscription manager"
    - "Indian markets (NSE/BSE, NIFTY 50, BANK NIFTY, Reliance, TCS, Options) resolve and stream live data"
    - "Forex majors and crosses resolve with Bid/Ask/Spread and tick volume"
    - "TradingView-class chart supports multiple timeframes, custom EMAs/SMAs, drawings, Fibonacci, and pattern recognition"
    - "START.bat and STOP.bat function seamlessly"
---

# Plan 2.1: Global Market Research & Trading Terminal Implementation

## Wave 1: Backend Multi-Provider Engine & Real-Time WebSocket Server
- Task 1: Environment & Provider Abstraction (`types.ts`, `upstox.ts`, `finnhub.ts`, `forex.ts`, `indices.ts`, `router.ts`).
- Task 2: Backend WebSocket Server & Incremental Live Candle Engine (`websocket.ts`, `index.ts`).
- Task 3: Market Router & Endpoints Expansion in `routes/market.ts` (Unified search, Indian F&O option chain, forex, global indices).

## Wave 2: Frontend Professional Charting, Indicators & Drawing Tools
- Task 4: Indicators & Patterns Engine (`web/lib/indicators.ts`, `web/lib/patterns.ts`).
- Task 5: TradingView-class Chart Widget Upgrade (`web/components/widgets/ChartWidget.tsx`).
  - Timeframes: 1m -> 1M; Ranges: 1D -> MAX.
  - Interactive drawings (trendlines, horizontal/vertical rays, rectangles, Fibonacci).
  - Pattern recognition overlays & Multi-Timeframe (MTF) trend summary.
  - Incremental real-time candle updates from WebSocket.
  - Latency Monitor & Data Quality badge.

## Wave 3: Unified Search, Multi-Asset Watchlists, F&O Widget & Validation
- Task 6: Unified Global Search (`CommandPalette.tsx`), Multi-asset Watchlists (`WatchlistWidget.tsx`), and Indian Option Chain (`OptionsWidget.tsx`).
- Task 7: Empirical End-to-End Testing (START.bat -> verify NIFTY, RELIANCE, EUR/USD, AAPL, BTCUSDT -> STOP.bat -> restart).
