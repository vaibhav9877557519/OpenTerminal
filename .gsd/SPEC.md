# OpenTerminal Upgrade: Global Market Research & Trading Terminal Specification

## 1. Objective
Transform OpenTerminal into a professional multi-asset research and trading terminal supporting:
- Indian Markets (NSE/BSE equities, NIFTY 50, BANK NIFTY, Sector indices, India VIX, F&O Option Chains) via Upstox API v2/v3.
- Global Forex (Majors, Crosses, USD/INR, Bid/Ask/Spread, Tick Volume, Currency Strength Meter) via Finnhub & Yahoo Finance.
- US Equities, Global Indices (S&P 500, Nasdaq, Dow, FTSE, DAX, Nikkei) & Crypto (Binance/CoinGecko).
- Real-time WebSocket streaming architecture with incremental live candle updates.
- Real observed Latency Monitor and Data Quality Engine (LIVE, DELAYED, STALE, UNAVAILABLE).
- Professional TradingView-class charting experience using lightweight-charts:
  - Chart Types: Candlestick, Bar/OHLC, Line, Area, Baseline, Heikin Ashi.
  - Complete timeframes (1m -> 1M) and ranges (1D -> MAX).
  - Configurable multiple EMAs/SMAs, VWAP, Bollinger, RSI, MACD, ATR, Stochastic, ADX, OBV.
  - Interactive Drawing Tools (Trend lines, Horiz/Vert lines, Rays, Rectangles, Fibonacci Retracement, Measure).
  - Optional Automated Pattern Recognition (Reversals, Continuations, Candlestick patterns).
  - Multi-Timeframe (MTF) trend summary.
  - Local Alerts system & Saved Chart Layouts.
- Unified Global Search and Provider Router.

## 2. Constraints & Security
- NEVER hard-code credentials in frontend code or commit to Git.
- Store `UPSTOX_ACCESS_TOKEN` and `FINNHUB_API_KEY` strictly in backend `.env`.
- No scraping of TradingView, no unauthorized TradingView APIs, no fake data.
- HFTENGINE must NOT be touched or integrated.
- Preserve working START.bat, STOP.bat, and local bindings (127.0.0.1:4000 & localhost:3000).

## 3. Architecture
```
[Provider WS / REST]
  ├── Upstox (NSE/BSE, Indices, Options, Feeder WS)
  ├── Finnhub (US Stocks, Forex pairs, WS)
  ├── Crypto (Binance/CoinGecko)
  └── Yahoo/Nasdaq/FRED/ECB (Fallbacks & Macro)
            ↓
    [Provider Router & Normalizer]
            ↓
    [Data Quality & Latency Engine]
            ↓
    [Backend WebSocket Server (ws://localhost:4000/ws)]
            ↓
    [Frontend useMarketStream Hook]
            ↓
    [TradingView-Class Lightweight Chart & Widgets]
```
