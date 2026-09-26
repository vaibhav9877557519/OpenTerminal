import { tracked } from "./registry.js";
import type { NormalizedQuote, NormalizedCandle, SearchResult } from "./types.js";

export interface ForexPairConfig {
  symbol: string; // e.g. "EUR/USD"
  cleanSymbol: string; // "EURUSD"
  yahooSymbol: string; // "EURUSD=X"
  name: string;
  base: string;
  quote: string;
  category: "major" | "cross" | "exotic";
}

export const FOREX_PAIRS: ForexPairConfig[] = [
  // Majors
  { symbol: "EUR/USD", cleanSymbol: "EURUSD", yahooSymbol: "EURUSD=X", name: "Euro / US Dollar", base: "EUR", quote: "USD", category: "major" },
  { symbol: "GBP/USD", cleanSymbol: "GBPUSD", yahooSymbol: "GBPUSD=X", name: "British Pound / US Dollar", base: "GBP", quote: "USD", category: "major" },
  { symbol: "USD/JPY", cleanSymbol: "USDJPY", yahooSymbol: "USDJPY=X", name: "US Dollar / Japanese Yen", base: "USD", quote: "JPY", category: "major" },
  { symbol: "USD/CHF", cleanSymbol: "USDCHF", yahooSymbol: "USDCHF=X", name: "US Dollar / Swiss Franc", base: "USD", quote: "CHF", category: "major" },
  { symbol: "AUD/USD", cleanSymbol: "AUDUSD", yahooSymbol: "AUDUSD=X", name: "Australian Dollar / US Dollar", base: "AUD", quote: "USD", category: "major" },
  { symbol: "USD/CAD", cleanSymbol: "USDCAD", yahooSymbol: "USDCAD=X", name: "US Dollar / Canadian Dollar", base: "USD", quote: "CAD", category: "major" },
  { symbol: "NZD/USD", cleanSymbol: "NZDUSD", yahooSymbol: "NZDUSD=X", name: "New Zealand Dollar / US Dollar", base: "NZD", quote: "USD", category: "major" },

  // Crosses
  { symbol: "EUR/GBP", cleanSymbol: "EURGBP", yahooSymbol: "EURGBP=X", name: "Euro / British Pound", base: "EUR", quote: "GBP", category: "cross" },
  { symbol: "EUR/JPY", cleanSymbol: "EURJPY", yahooSymbol: "EURJPY=X", name: "Euro / Japanese Yen", base: "EUR", quote: "JPY", category: "cross" },
  { symbol: "GBP/JPY", cleanSymbol: "GBPJPY", yahooSymbol: "GBPJPY=X", name: "British Pound / Japanese Yen", base: "GBP", quote: "JPY", category: "cross" },
  { symbol: "EUR/CHF", cleanSymbol: "EURCHF", yahooSymbol: "EURCHF=X", name: "Euro / Swiss Franc", base: "EUR", quote: "CHF", category: "cross" },
  { symbol: "GBP/CHF", cleanSymbol: "GBPCHF", yahooSymbol: "GBPCHF=X", name: "British Pound / Swiss Franc", base: "GBP", quote: "CHF", category: "cross" },
  { symbol: "AUD/JPY", cleanSymbol: "AUDJPY", yahooSymbol: "AUDJPY=X", name: "Australian Dollar / Japanese Yen", base: "AUD", quote: "JPY", category: "cross" },
  { symbol: "CAD/JPY", cleanSymbol: "CADJPY", yahooSymbol: "CADJPY=X", name: "Canadian Dollar / Japanese Yen", base: "CAD", quote: "JPY", category: "cross" },
  { symbol: "NZD/JPY", cleanSymbol: "NZDJPY", yahooSymbol: "NZDJPY=X", name: "New Zealand Dollar / Japanese Yen", base: "NZD", quote: "JPY", category: "cross" },

  // Indian Rupee Pair
  { symbol: "USD/INR", cleanSymbol: "USDINR", yahooSymbol: "USDINR=X", name: "US Dollar / Indian Rupee", base: "USD", quote: "INR", category: "exotic" },
  { symbol: "EUR/INR", cleanSymbol: "EURINR", yahooSymbol: "EURINR=X", name: "Euro / Indian Rupee", base: "EUR", quote: "INR", category: "exotic" },
  { symbol: "GBP/INR", cleanSymbol: "GBPINR", yahooSymbol: "GBPINR=X", name: "British Pound / Indian Rupee", base: "GBP", quote: "INR", category: "exotic" },
];

export function normalizeForexSymbol(raw: string): ForexPairConfig | null {
  const clean = raw.trim().toUpperCase().replace(/[\/\s_-]/g, "").replace(/=X$/, "");
  const match = FOREX_PAIRS.find(
    (p) => p.cleanSymbol === clean || p.yahooSymbol === raw.toUpperCase() || p.symbol.toUpperCase() === raw.toUpperCase()
  );
  if (match) return match;

  // Pattern check: if 6 chars e.g. "EURUSD"
  if (clean.length === 6) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    return {
      symbol: `${base}/${quote}`,
      cleanSymbol: clean,
      yahooSymbol: `${clean}=X`,
      name: `${base} / ${quote}`,
      base,
      quote,
      category: "cross",
    };
  }
  return null;
}

export function searchForex(query: string): SearchResult[] {
  const q = query.trim().toUpperCase().replace(/[\/\s_-]/g, "");
  if (!q) return [];
  const matches = FOREX_PAIRS.filter(
    (p) => p.cleanSymbol.includes(q) || p.symbol.includes(q) || p.name.toUpperCase().includes(q)
  );

  return matches.map((m) => ({
    symbol: m.symbol,
    name: m.name,
    assetType: "forex",
    exchange: "FOREX",
    country: "GLOBAL",
    source: "forex",
  }));
}

// -------------------------------------------------------------
// Live Forex Quote Fetching (Yahoo Finance & Provider fallback)
// -------------------------------------------------------------

export async function quote(rawSymbol: string): Promise<NormalizedQuote> {
  const pair = normalizeForexSymbol(rawSymbol);
  if (!pair) throw new Error(`Unsupported forex pair: ${rawSymbol}`);

  return tracked("forex", async () => {
    const t0 = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair.yahooSymbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const processingMs = Date.now() - t0;

    if (!res.ok) {
      throw new Error(`Forex quote error ${res.status}`);
    }

    const json = (await res.json()) as any;
    const result = json.chart?.result?.[0];
    if (!result) throw new Error(`No forex data for ${pair.symbol}`);

    const meta = result.meta;
    const price = Number(meta.regularMarketPrice ?? 0);
    const previousClose = meta.chartPreviousClose ? Number(meta.chartPreviousClose) : null;
    const change = previousClose && price ? price - previousClose : null;
    const changePercent = previousClose && change !== null ? (change / previousClose) * 100 : null;

    const high = meta.regularMarketDayHigh ? Number(meta.regularMarketDayHigh) : null;
    const low = meta.regularMarketDayLow ? Number(meta.regularMarketDayLow) : null;

    // In spot FX, bid/ask estimate or spread
    const bid = meta.bid ? Number(meta.bid) : price;
    const ask = meta.ask ? Number(meta.ask) : price;
    const spread = bid && ask ? Math.abs(ask - bid) : null;

    return {
      symbol: pair.symbol,
      name: pair.name,
      assetType: "forex",
      price,
      bid,
      ask,
      mid: price,
      spread,
      change,
      changePercent,
      open: meta.regularMarketDayHigh ? Number(meta.regularMarketDayHigh) : null,
      high,
      low,
      previousClose,
      volume: null, // Centralized exchange volume does NOT exist for spot FX
      tickVolume: meta.regularMarketVolume ?? null,
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
      source: "forex",
      status: "LIVE",
      currency: pair.quote,
      exchange: "FOREX",
      feedLatencyMs: processingMs,
    };
  });
}

// -------------------------------------------------------------
// Forex Historical Candles
// -------------------------------------------------------------

export async function history(rawSymbol: string, rangeKey = "6M"): Promise<NormalizedCandle[]> {
  const pair = normalizeForexSymbol(rawSymbol);
  if (!pair) throw new Error(`Unsupported forex pair: ${rawSymbol}`);

  return tracked("forex", async () => {
    let range = "6mo";
    let interval = "1d";

    if (rangeKey === "1D") {
      range = "1d";
      interval = "5m";
    } else if (rangeKey === "5D") {
      range = "5d";
      interval = "15m";
    } else if (rangeKey === "1M") {
      range = "1mo";
      interval = "1h";
    } else if (rangeKey === "1Y") {
      range = "1y";
      interval = "1d";
    } else if (rangeKey === "5Y" || rangeKey === "MAX") {
      range = "5y";
      interval = "1wk";
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair.yahooSymbol)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`Forex history error ${res.status}`);

    const json = (await res.json()) as any;
    const result = json.chart?.result?.[0];
    if (!result || !result.timestamp) return [];

    const timestamps: number[] = result.timestamp;
    const quotes = result.indicators?.quote?.[0] ?? {};
    const opens: number[] = quotes.open ?? [];
    const highs: number[] = quotes.high ?? [];
    const lows: number[] = quotes.low ?? [];
    const closes: number[] = quotes.close ?? [];
    const volumes: number[] = quotes.volume ?? [];

    const candles: NormalizedCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      if (open == null || high == null || low == null || close == null) continue;

      candles.push({
        time: timestamps[i],
        open,
        high,
        low,
        close,
        volume: 0, // Centralized exchange volume does NOT exist for spot FX
        tickVolume: volumes[i] ?? 0,
        source: "forex",
        assetType: "forex",
      });
    }

    return candles.sort((a, b) => a.time - b.time);
  });
}

// -------------------------------------------------------------
// Currency Strength Meter
// Measures relative strength score (-100 to +100) across 8 major currencies
// -------------------------------------------------------------

export interface CurrencyStrengthScore {
  currency: string;
  strength: number; // -100 to +100
  rating: "Strong" | "Moderate" | "Weak";
  color: string;
}

export async function calculateCurrencyStrength(): Promise<CurrencyStrengthScore[]> {
  const currencies = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD"];
  const quotesMap = new Map<string, number>();

  // Fetch daily change for major pairs
  const pairsToFetch = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD",
    "EUR/GBP", "EUR/JPY", "GBP/JPY",
  ];

  await Promise.all(
    pairsToFetch.map(async (p) => {
      try {
        const q = await quote(p);
        if (q.changePercent !== null) {
          quotesMap.set(p, q.changePercent);
        }
      } catch {}
    })
  );

  const scores: Record<string, number> = {};
  for (const c of currencies) scores[c] = 0;

  // Pair evaluation logic
  const check = (pair: string, base: string, quoteCcy: string) => {
    const chg = quotesMap.get(pair);
    if (chg !== undefined) {
      scores[base] += chg;
      scores[quoteCcy] -= chg;
    }
  };

  check("EUR/USD", "EUR", "USD");
  check("GBP/USD", "GBP", "USD");
  check("USD/JPY", "USD", "JPY");
  check("USD/CHF", "USD", "CHF");
  check("AUD/USD", "AUD", "USD");
  check("USD/CAD", "USD", "CAD");
  check("NZD/USD", "NZD", "USD");
  check("EUR/GBP", "EUR", "GBP");
  check("EUR/JPY", "EUR", "JPY");
  check("GBP/JPY", "GBP", "JPY");

  return currencies.map((c) => {
    // Normalize into -100 to +100 scale clamped
    const raw = scores[c];
    const clamped = Math.max(-100, Math.min(100, Math.round(raw * 20)));
    const rating: "Strong" | "Moderate" | "Weak" = clamped > 25 ? "Strong" : clamped < -25 ? "Weak" : "Moderate";
    const color = clamped > 25 ? "#00c853" : clamped < -25 ? "#ff3d3d" : "#ffd966";

    return {
      currency: c,
      strength: clamped,
      rating,
      color,
    };
  }).sort((a, b) => b.strength - a.strength);
}
