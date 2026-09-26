import * as upstox from "./upstox.js";
import * as finnhub from "./finnhub.js";
import * as forex from "./forex.js";
import * as indices from "./indices.js";
import * as binance from "./binance.js";
import * as nasdaq from "./nasdaq.js";
import * as yahoo from "./yahoo.js";
import * as stooq from "./stooq.js";
import { withFallback } from "./registry.js";
import type { NormalizedQuote, NormalizedCandle, SearchResult } from "./types.js";

export type ProviderCategory = "upstox" | "forex" | "crypto" | "indices" | "us_stock";

export function detectProviderCategory(symbol: string): ProviderCategory {
  const s = symbol.trim().toUpperCase();

  // 1. Check Crypto
  if (binance.CRYPTO_SYMBOLS.has(s) || /^(BTC|ETH|SOL|XRP|DOGE|BNB|ADA|AVAX)(USD|USDT)?$/.test(s)) {
    return "crypto";
  }

  // 2. Check Forex pairs (e.g. EUR/USD, EURUSD, USDINR)
  if (forex.normalizeForexSymbol(s)) {
    return "forex";
  }

  // 3. Check Global Indices
  if (indices.resolveIndex(s)) {
    return "indices";
  }

  // 4. Check Indian Instruments
  if (upstox.resolveIndianInstrument(s)) {
    return "upstox";
  }

  // 5. Default to US stock/ETF
  return "us_stock";
}

/**
 * Universal Quote Resolver
 * Frontend calls getQuote(symbol) without knowing which provider delivers it.
 */
export async function getQuote(symbol: string): Promise<NormalizedQuote> {
  const cat = detectProviderCategory(symbol);

  switch (cat) {
    case "upstox":
      return upstox.quote(symbol);

    case "forex":
      return forex.quote(symbol);

    case "indices":
      return indices.quote(symbol);

    case "crypto": {
      const q = await binance.quote(symbol);
      const price = q.price ?? 0;
      return {
        symbol: q.symbol,
        name: q.name ?? q.symbol,
        assetType: "crypto",
        price,
        bid: q.bid,
        ask: q.ask,
        mid: price,
        spread: null,
        change: q.change,
        changePercent: q.changePercent,
        open: q.open,
        high: q.high,
        low: q.low,
        previousClose: q.previousClose,
        volume: q.volume,
        timestamp: Date.now(),
        source: "binance",
        status: "LIVE",
        currency: "USDT",
        exchange: "BINANCE",
      };
    }

    case "us_stock":
    default: {
      return withFallback([
        ["finnhub", () => finnhub.quote(symbol)],
        [
          "nasdaq",
          async () => {
            const q = await nasdaq.quote(symbol);
            const price = q.price ?? 0;
            return {
              symbol: q.symbol,
              name: q.name ?? q.symbol,
              assetType: "stock",
              price,
              bid: q.bid,
              ask: q.ask,
              mid: price,
              spread: null,
              change: q.change,
              changePercent: q.changePercent,
              open: q.open,
              high: q.high,
              low: q.low,
              previousClose: q.previousClose,
              volume: q.volume,
              marketCap: q.marketCap,
              pe: q.pe,
              eps: q.eps,
              dividendYield: q.dividendYield,
              timestamp: Date.now(),
              source: "nasdaq",
              status: "LIVE",
              currency: q.currency ?? "USD",
              exchange: q.exchange ?? "UNKNOWN",
            };
          },
        ],
        [
          "yahoo",
          async () => {
            const q = await yahoo.quoteFromChart(symbol);
            const price = q.price ?? 0;
            return {
              symbol: q.symbol,
              name: q.name ?? q.symbol,
              assetType: "stock",
              price,
              bid: q.bid,
              ask: q.ask,
              mid: price,
              spread: null,
              change: q.change,
              changePercent: q.changePercent,
              open: q.open,
              high: q.high,
              low: q.low,
              previousClose: q.previousClose,
              volume: q.volume,
              timestamp: Date.now(),
              source: "yahoo",
              status: "LIVE",
              currency: q.currency ?? "USD",
              exchange: q.exchange ?? "UNKNOWN",
            };
          },
        ],
      ]);
    }
  }
}

/**
 * Universal Historical Candles Resolver
 */
export async function getHistory(symbol: string, rangeKey = "6M"): Promise<NormalizedCandle[]> {
  const cat = detectProviderCategory(symbol);

  switch (cat) {
    case "upstox":
      return upstox.history(symbol, rangeKey);

    case "forex":
      return forex.history(symbol, rangeKey);

    case "crypto": {
      const candles = await binance.history(symbol, rangeKey);
      return candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        source: "binance",
        assetType: "crypto",
      }));
    }

    case "indices": {
      const idx = indices.resolveIndex(symbol);
      if (idx && idx.source === "upstox") {
        return upstox.history(idx.providerKey, rangeKey);
      }
      return withFallback([
        ["nasdaq", () => nasdaq.history(idx?.providerKey ?? symbol, rangeKey)],
        [
          "yahoo",
          async () => {
            const range = rangeKey === "1D" ? "1d" : rangeKey === "1Y" ? "1y" : "6mo";
            const interval = rangeKey === "1D" ? "5m" : "1d";
            const rows = await yahoo.history(idx?.providerKey ?? symbol, range, interval);
            return rows.map((r) => ({ ...r, source: "yahoo", assetType: "index" as const }));
          },
        ],
        ["stooq", () => stooq.history(idx?.providerKey ?? symbol)],
      ]);
    }

    case "us_stock":
    default: {
      return withFallback([
        ["nasdaq", () => nasdaq.history(symbol, rangeKey)],
        [
          "yahoo",
          async () => {
            const range = rangeKey === "1D" ? "1d" : rangeKey === "1Y" ? "1y" : "6mo";
            const interval = rangeKey === "1D" ? "5m" : "1d";
            const rows = await yahoo.history(symbol, range, interval);
            return rows.map((r) => ({ ...r, source: "yahoo", assetType: "stock" as const }));
          },
        ],
        ["stooq", () => stooq.history(symbol)],
      ]);
    }
  }
}

/**
 * Unified Global Search Across All Asset Classes
 */
export async function universalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Search in parallel across Indian instruments, Forex, Indices, and Finnhub/Yahoo
  const [indianMatches, forexMatches, indexMatches, usMatches] = await Promise.all([
    Promise.resolve(upstox.searchIndianInstruments(q)),
    Promise.resolve(forex.searchForex(q)),
    Promise.resolve(indices.searchIndices(q)),
    finnhub.search(q).catch(async () => {
      const yResults = await yahoo.search(q).catch(() => []);
      return yResults.map((y) => ({
        symbol: y.symbol,
        name: y.name,
        assetType: "stock" as const,
        exchange: y.exchange,
        country: "US",
        source: "yahoo",
      }));
    }),
  ]);

  // Combine results with prioritized order
  const combined: SearchResult[] = [
    ...indianMatches,
    ...forexMatches,
    ...indexMatches,
    ...usMatches,
  ];

  // Deduplicate by symbol
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const item of combined) {
    if (!seen.has(item.symbol)) {
      seen.add(item.symbol);
      out.push(item);
    }
  }

  return out.slice(0, 30);
}
