import { tracked } from "./registry.js";
import type { NormalizedQuote, SearchResult } from "./types.js";
import * as upstox from "./upstox.js";

export interface GlobalIndexConfig {
  symbol: string;
  name: string;
  region: "USA" | "EUROPE" | "ASIA" | "INDIA";
  providerKey: string;
  source: "upstox" | "yahoo" | "nasdaq";
}

export const GLOBAL_INDICES: GlobalIndexConfig[] = [
  // India
  { symbol: "NIFTY", name: "NIFTY 50", region: "INDIA", providerKey: "NIFTY", source: "upstox" },
  { symbol: "BANKNIFTY", name: "BANK NIFTY", region: "INDIA", providerKey: "BANKNIFTY", source: "upstox" },
  { symbol: "SENSEX", name: "BSE SENSEX", region: "INDIA", providerKey: "SENSEX", source: "upstox" },
  { symbol: "INDIAVIX", name: "India VIX", region: "INDIA", providerKey: "INDIAVIX", source: "upstox" },

  // USA
  { symbol: "SPX", name: "S&P 500 Index", region: "USA", providerKey: "^GSPC", source: "yahoo" },
  { symbol: "NDX", name: "Nasdaq 100", region: "USA", providerKey: "^NDX", source: "yahoo" },
  { symbol: "DJI", name: "Dow Jones Industrial Average", region: "USA", providerKey: "^DJI", source: "yahoo" },
  { symbol: "RUT", name: "Russell 2000", region: "USA", providerKey: "^RUT", source: "yahoo" },
  { symbol: "VIX", name: "CBOE Volatility Index", region: "USA", providerKey: "^VIX", source: "yahoo" },

  // Europe
  { symbol: "FTSE", name: "FTSE 100", region: "EUROPE", providerKey: "^FTSE", source: "yahoo" },
  { symbol: "DAX", name: "DAX Performance Index", region: "EUROPE", providerKey: "^GDAXI", source: "yahoo" },
  { symbol: "CAC", name: "CAC 40", region: "EUROPE", providerKey: "^FCHI", source: "yahoo" },
  { symbol: "STOXX50", name: "Euro Stoxx 50", region: "EUROPE", providerKey: "^STOXX50E", source: "yahoo" },

  // Asia
  { symbol: "N225", name: "Nikkei 225", region: "ASIA", providerKey: "^N225", source: "yahoo" },
  { symbol: "HSI", name: "Hang Seng Index", region: "ASIA", providerKey: "^HSI", source: "yahoo" },
  { symbol: "SSEC", name: "Shanghai Composite", region: "ASIA", providerKey: "000001.SS", source: "yahoo" },
  { symbol: "KS11", name: "KOSPI Composite", region: "ASIA", providerKey: "^KS11", source: "yahoo" },
];

export function resolveIndex(symbol: string): GlobalIndexConfig | null {
  const clean = symbol.trim().toUpperCase().replace(/^\^/, "");
  return (
    GLOBAL_INDICES.find(
      (idx) => idx.symbol === clean || idx.providerKey.toUpperCase() === symbol.toUpperCase() || idx.name.toUpperCase() === symbol.toUpperCase()
    ) ?? null
  );
}

export function searchIndices(query: string): SearchResult[] {
  const q = query.trim().toUpperCase().replace(/^\^/, "");
  if (!q) return [];
  const matches = GLOBAL_INDICES.filter(
    (idx) => idx.symbol.includes(q) || idx.name.toUpperCase().includes(q) || idx.providerKey.toUpperCase().includes(q)
  );
  return matches.map((m) => ({
    symbol: m.symbol,
    name: m.name,
    assetType: "index",
    exchange: m.region,
    country: m.region,
    source: m.source,
  }));
}

export async function quote(symbol: string): Promise<NormalizedQuote> {
  const idx = resolveIndex(symbol);
  if (!idx) throw new Error(`Unknown index: ${symbol}`);

  if (idx.source === "upstox") {
    return upstox.quote(idx.providerKey);
  }

  return tracked("indices", async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.providerKey)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Index quote error ${res.status}`);

    const json = (await res.json()) as any;
    const result = json.chart?.result?.[0];
    if (!result) throw new Error(`No quote data for index ${idx.symbol}`);

    const meta = result.meta;
    const price = Number(meta.regularMarketPrice ?? 0);
    const previousClose = meta.chartPreviousClose ? Number(meta.chartPreviousClose) : null;
    const change = previousClose && price ? price - previousClose : null;
    const changePercent = previousClose && change !== null ? (change / previousClose) * 100 : null;

    return {
      symbol: idx.symbol,
      name: idx.name,
      assetType: "index",
      price,
      bid: null,
      ask: null,
      mid: price,
      spread: null,
      change,
      changePercent,
      open: meta.regularMarketDayHigh ? Number(meta.regularMarketDayHigh) : null,
      high: meta.regularMarketDayHigh ? Number(meta.regularMarketDayHigh) : null,
      low: meta.regularMarketDayLow ? Number(meta.regularMarketDayLow) : null,
      previousClose,
      volume: meta.regularMarketVolume ?? null,
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
      source: "global-indices",
      status: "LIVE",
      currency: meta.currency ?? "USD",
      exchange: idx.region,
    };
  });
}

export async function allIndices(): Promise<NormalizedQuote[]> {
  const results = await Promise.allSettled(GLOBAL_INDICES.map((idx) => quote(idx.symbol)));
  const out: NormalizedQuote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(r.value);
  }
  return out;
}
