import { tracked } from "./registry.js";
import type {
  NormalizedQuote,
  NormalizedCandle,
  NormalizedOptionChain,
  NormalizedOptionStrikeRow,
  SearchResult,
} from "./types.js";

import fs from "node:fs";
import path from "node:path";

const UPSTOX_BASE = "https://api.upstox.com";

function loadEnvKey(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const p1 = path.resolve(process.cwd(), ".env");
    const p2 = path.resolve(process.cwd(), "..", ".env");
    const file = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null;
    if (file) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("#") && t.startsWith(key + "=")) {
          const val = t.slice(key.length + 1).trim();
          process.env[key] = val;
          return val;
        }
      }
    }
  } catch {}
  return undefined;
}

function getAccessToken(): string {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim() || loadEnvKey("UPSTOX_ACCESS_TOKEN");
  if (!token) throw new Error("UPSTOX_ACCESS_TOKEN is not configured in .env");
  return token;
}

function authHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${getAccessToken()}`,
  };
}

// -------------------------------------------------------------
// Indian Instrument & Index Master Registry
// -------------------------------------------------------------

export interface IndianInstrument {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  segment: "EQ" | "INDEX" | "FO";
  instrumentKey: string;
  isin?: string;
  aliases: string[];
}

export const INDIAN_INSTRUMENTS: IndianInstrument[] = [
  // Indices
  { symbol: "NIFTY", name: "Nifty 50", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty 50", aliases: ["NIFTY 50", "NIFTY50", "CNX NIFTY"] },
  { symbol: "BANKNIFTY", name: "Nifty Bank", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Bank", aliases: ["BANK NIFTY", "NIFTY BANK"] },
  { symbol: "NIFTYIT", name: "Nifty IT", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty IT", aliases: ["NIFTY IT", "CNX IT"] },
  { symbol: "NIFTYAUTO", name: "Nifty Auto", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Auto", aliases: ["NIFTY AUTO"] },
  { symbol: "NIFTYPHARMA", name: "Nifty Pharma", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Pharma", aliases: ["NIFTY PHARMA"] },
  { symbol: "NIFTYFMCG", name: "Nifty FMCG", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty FMCG", aliases: ["NIFTY FMCG"] },
  { symbol: "NIFTYMETAL", name: "Nifty Metal", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Metal", aliases: ["NIFTY METAL"] },
  { symbol: "NIFTYREALTY", name: "Nifty Realty", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Realty", aliases: ["NIFTY REALTY"] },
  { symbol: "NIFTYENERGY", name: "Nifty Energy", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Energy", aliases: ["NIFTY ENERGY"] },
  { symbol: "FINNIFTY", name: "Nifty Financial Services", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Fin Service", aliases: ["FIN NIFTY", "NIFTY FIN SERVICE"] },
  { symbol: "NIFTYPSU", name: "Nifty PSU Bank", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty PSU Bank", aliases: ["NIFTY PSU BANK"] },
  { symbol: "NIFTYMIDCAP", name: "Nifty Midcap 50", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|Nifty Midcap 50", aliases: ["NIFTY MIDCAP"] },
  { symbol: "INDIAVIX", name: "India VIX Volatility Index", exchange: "NSE", segment: "INDEX", instrumentKey: "NSE_INDEX|India VIX", aliases: ["INDIA VIX", "VIX"] },
  { symbol: "SENSEX", name: "BSE SENSEX", exchange: "BSE", segment: "INDEX", instrumentKey: "BSE_INDEX|SENSEX", aliases: ["BSE SENSEX", "BSESN"] },

  // Top Indian Equities (NSE)
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE002A01018", isin: "INE002A01018", aliases: ["RELIANCE INDUSTRIES", "RIL"] },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE467B01029", isin: "INE467B01029", aliases: ["TATA CONSULTANCY", "TATA TCS"] },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE040A01034", isin: "INE040A01034", aliases: ["HDFC", "HDFC BANK"] },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE090A01021", isin: "INE090A01021", aliases: ["ICICI", "ICICI BANK"] },
  { symbol: "INFY", name: "Infosys Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE009A01021", isin: "INE009A01021", aliases: ["INFOSYS"] },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE062A01020", isin: "INE062A01020", aliases: ["SBI", "STATE BANK"] },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE397D01024", isin: "INE397D01024", aliases: ["AIRTEL", "BHARTI AIRTEL"] },
  { symbol: "ITC", name: "ITC Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE154A01025", isin: "INE154A01025", aliases: ["ITC"] },
  { symbol: "LT", name: "Larsen & Toubro Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE018A01030", isin: "INE018A01030", aliases: ["L&T", "LARSEN"] },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE585B01010", isin: "INE585B01010", aliases: ["MARUTI SUZUKI"] },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE155A01022", isin: "INE155A01022", aliases: ["TATA MOTORS"] },
  { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE296A01024", isin: "INE296A01024", aliases: ["BAJAJ FINANCE"] },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE237A01028", isin: "INE237A01028", aliases: ["KOTAK", "KOTAK BANK"] },
  { symbol: "AXISBANK", name: "Axis Bank Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE238A01034", isin: "INE238A01034", aliases: ["AXIS", "AXIS BANK"] },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE030A01027", isin: "INE030A01027", aliases: ["HUL", "HINDUSTAN UNILEVER"] },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE044A01036", isin: "INE044A01036", aliases: ["SUN PHARMA"] },
  { symbol: "WIPRO", name: "Wipro Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE075A01022", isin: "INE075A01022", aliases: ["WIPRO"] },
  { symbol: "NTPC", name: "NTPC Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE733E01010", isin: "INE733E01010", aliases: ["NTPC"] },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE213A01029", isin: "INE213A01029", aliases: ["ONGC"] },
  { symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE752E01010", isin: "INE752E01010", aliases: ["POWER GRID", "POWERGRID"] },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE081A01020", isin: "INE081A01020", aliases: ["TATA STEEL"] },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE021A01026", isin: "INE021A01026", aliases: ["ASIAN PAINTS"] },
  { symbol: "TITAN", name: "Titan Company Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE280A01028", isin: "INE280A01028", aliases: ["TITAN"] },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE423A01024", isin: "INE423A01024", aliases: ["ADANI ENTERPRISES"] },
  { symbol: "ADANIPORTS", name: "Adani Ports & Special Economic Zone Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE742F01042", isin: "INE742F01042", aliases: ["ADANI PORTS"] },
  { symbol: "COALINDIA", name: "Coal India Ltd.", exchange: "NSE", segment: "EQ", instrumentKey: "NSE_EQ|INE522F01014", isin: "INE522F01014", aliases: ["COAL INDIA"] },
];

export function resolveIndianInstrument(symbolOrName: string): IndianInstrument | null {
  const raw = symbolOrName.trim().toUpperCase();
  const clean = raw.replace(/\.(NS|BO)$/, "").replace(/^(NSE_EQ\||BSE_EQ\||NSE_INDEX\||BSE_INDEX\|)/, "");

  // Exact symbol match in registry
  const bySym = INDIAN_INSTRUMENTS.find((i) => i.symbol === clean || i.instrumentKey === raw);
  if (bySym) return bySym;

  // Search by exact alias
  const byAlias = INDIAN_INSTRUMENTS.find(
    (i) => i.aliases.some((a) => a.toUpperCase() === clean)
  );
  if (byAlias) return byAlias;

  // Search by name match
  if (clean.length > 3) {
    const byName = INDIAN_INSTRUMENTS.find((i) => i.name.toUpperCase() === clean);
    if (byName) return byName;
  }

  // Explicit NSE/BSE prefix or suffix (e.g. RELIANCE.NS, NSE_EQ|INFY)
  if (raw.startsWith("NSE_") || raw.startsWith("BSE_") || symbolOrName.endsWith(".NS") || symbolOrName.endsWith(".BO")) {
    return {
      symbol: clean,
      name: `${clean} (NSE)`,
      exchange: raw.includes("BSE") ? "BSE" : "NSE",
      segment: "EQ",
      instrumentKey: raw.startsWith("NSE_") || raw.startsWith("BSE_") ? raw : `NSE_EQ|${clean}`,
      aliases: [clean],
    };
  }

  return null;
}

export function searchIndianInstruments(query: string): SearchResult[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const matches = INDIAN_INSTRUMENTS.filter(
    (inst) =>
      inst.symbol.includes(q) ||
      inst.name.toUpperCase().includes(q) ||
      inst.aliases.some((a) => a.toUpperCase().includes(q))
  );

  return matches.map((m) => ({
    symbol: m.symbol,
    name: m.name,
    assetType: m.segment === "INDEX" ? "index" : "stock",
    exchange: m.exchange,
    country: "IN",
    source: "upstox",
  }));
}

// -------------------------------------------------------------
// Upstox Quotes Fetching & Normalization
// -------------------------------------------------------------

export async function quote(symbol: string): Promise<NormalizedQuote> {
  return tracked("upstox", async () => {
    const inst = resolveIndianInstrument(symbol);
    if (!inst) throw new Error(`Unknown Indian instrument: ${symbol}`);

    const t0 = Date.now();
    const url = `${UPSTOX_BASE}/v2/market-quote/quotes?instrument_key=${encodeURIComponent(inst.instrumentKey)}`;
    const res = await fetch(url, { headers: authHeaders() });
    const processingMs = Date.now() - t0;

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Upstox quote error ${res.status}: ${txt}`);
    }

    const json = (await res.json()) as any;
    const dataKey = Object.keys(json.data ?? {})[0];
    const item = json.data?.[dataKey];
    if (!item) throw new Error(`No quote data for ${symbol}`);

    const price = Number(item.last_price ?? item.ohlc?.close ?? 0);
    const prevClose = item.ohlc?.close ? Number(item.ohlc.close) : null;
    const open = item.ohlc?.open ? Number(item.ohlc.open) : null;
    const high = item.ohlc?.high ? Number(item.ohlc.high) : null;
    const low = item.ohlc?.low ? Number(item.ohlc.low) : null;
    const change = prevClose !== null && price ? price - prevClose : null;
    const changePercent = prevClose && change !== null ? (change / prevClose) * 100 : null;

    // Upstox provides depth if available
    const bestBid = item.depth?.buy?.[0]?.price ?? null;
    const bestAsk = item.depth?.sell?.[0]?.price ?? null;

    return {
      symbol: inst.symbol,
      name: inst.name,
      assetType: inst.segment === "INDEX" ? "index" : "stock",
      price,
      bid: bestBid,
      ask: bestAsk,
      mid: bestBid && bestAsk ? (bestBid + bestAsk) / 2 : price,
      spread: bestBid && bestAsk ? bestAsk - bestBid : null,
      change,
      changePercent,
      open,
      high,
      low,
      previousClose: prevClose,
      volume: item.volume ?? 0,
      openInterest: item.oi ?? null,
      lastTradeQuantity: item.last_quantity ?? null,
      timestamp: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
      source: "upstox",
      status: "LIVE",
      currency: "INR",
      exchange: inst.exchange,
      feedLatencyMs: processingMs,
    };
  });
}

export async function quotes(symbols: string[]): Promise<NormalizedQuote[]> {
  const results = await Promise.allSettled(symbols.map((s) => quote(s)));
  const out: NormalizedQuote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(r.value);
  }
  return out;
}

// -------------------------------------------------------------
// Upstox Historical Candles Fetching
// -------------------------------------------------------------

function formatUpstoxDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function aggregateCandles(candles: NormalizedCandle[], bucketSeconds: number): NormalizedCandle[] {
  if (candles.length === 0 || bucketSeconds <= 0) return candles;
  const map = new Map<number, NormalizedCandle>();

  for (const c of candles) {
    const bucket = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    const existing = map.get(bucket);
    if (!existing) {
      map.set(bucket, {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        tickVolume: c.tickVolume,
        source: c.source,
        assetType: c.assetType,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = (existing.volume ?? 0) + (c.volume ?? 0);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

export async function history(symbol: string, rangeKey = "6M", customInterval?: string): Promise<NormalizedCandle[]> {
  return tracked("upstox", async () => {
    const inst = resolveIndianInstrument(symbol);
    if (!inst) throw new Error(`Unknown Indian instrument: ${symbol}`);

    const now = new Date();
    const toDate = formatUpstoxDate(now);
    let fromDate = formatUpstoxDate(new Date(now.getTime() - 180 * 86400 * 1000));
    let interval = "day";
    let aggregateSec = 0;

    if (customInterval) {
      const ci = customInterval.toLowerCase();
      switch (ci) {
        case "1m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 5 * 86400 * 1000));
          interval = "1minute";
          break;
        case "3m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 7 * 86400 * 1000));
          interval = "1minute";
          aggregateSec = 180;
          break;
        case "5m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 10 * 86400 * 1000));
          interval = "1minute";
          aggregateSec = 300;
          break;
        case "15m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 20 * 86400 * 1000));
          interval = "1minute";
          aggregateSec = 900;
          break;
        case "30m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 60 * 86400 * 1000));
          interval = "30minute";
          break;
        case "45m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 20 * 86400 * 1000));
          interval = "1minute";
          aggregateSec = 2700;
          break;
        case "1h":
        case "60m":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 90 * 86400 * 1000));
          interval = "30minute";
          aggregateSec = 3600;
          break;
        case "2h":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 120 * 86400 * 1000));
          interval = "30minute";
          aggregateSec = 7200;
          break;
        case "4h":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 180 * 86400 * 1000));
          interval = "30minute";
          aggregateSec = 14400;
          break;
        case "1d":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 365 * 86400 * 1000));
          interval = "day";
          break;
        case "1w":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 1825 * 86400 * 1000));
          interval = "week";
          break;
        case "1m_month":
        case "1mo":
          fromDate = formatUpstoxDate(new Date(now.getTime() - 3650 * 86400 * 1000));
          interval = "month";
          break;
        default:
          fromDate = formatUpstoxDate(new Date(now.getTime() - 365 * 86400 * 1000));
          interval = "day";
      }
    } else {
      if (rangeKey === "1D") {
        fromDate = formatUpstoxDate(new Date(now.getTime() - 2 * 86400 * 1000));
        interval = "30minute";
      } else if (rangeKey === "5D") {
        fromDate = formatUpstoxDate(new Date(now.getTime() - 7 * 86400 * 1000));
        interval = "30minute";
      } else if (rangeKey === "1M") {
        fromDate = formatUpstoxDate(new Date(now.getTime() - 35 * 86400 * 1000));
        interval = "day";
      } else if (rangeKey === "1Y") {
        fromDate = formatUpstoxDate(new Date(now.getTime() - 365 * 86400 * 1000));
        interval = "day";
      } else if (rangeKey === "5Y" || rangeKey === "MAX") {
        fromDate = formatUpstoxDate(new Date(now.getTime() - 1825 * 86400 * 1000));
        interval = "week";
      }
    }

    const url = `${UPSTOX_BASE}/v2/historical-candle/${encodeURIComponent(inst.instrumentKey)}/${interval}/${toDate}/${fromDate}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Upstox history error ${res.status}: ${txt}`);
    }

    const json = (await res.json()) as any;
    const rawCandles = json.data?.candles;
    if (!Array.isArray(rawCandles)) return [];


    // Upstox candle format: [timestamp_str, open, high, low, close, volume, open_interest]
    // Raw candles arrive sorted descending (newest first); lightweight-charts needs ascending
    const candles: NormalizedCandle[] = rawCandles.map((c: any[]) => {
      // timestamp_str is e.g. "2026-09-25T00:00:00+05:30" or "25-09-2026 00:00:00"
      let tSec: number;
      if (typeof c[0] === "string" && c[0].includes("-") && c[0].indexOf("-") === 2) {
        // DD-MM-YYYY format
        const [d, m, yAndTime] = c[0].split("-");
        const [y, timeStr] = yAndTime.split(" ");
        tSec = Math.floor(new Date(`${y}-${m}-${d}T${timeStr ?? "00:00:00"}Z`).getTime() / 1000);
      } else {
        tSec = Math.floor(new Date(c[0]).getTime() / 1000);
      }

      return {
        time: isNaN(tSec) ? Math.floor(Date.now() / 1000) : tSec,
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5] ?? 0),
        source: "upstox",
        assetType: inst.segment === "INDEX" ? "index" : "stock",
      };
    });

    const sorted = candles.sort((a, b) => a.time - b.time);
    return aggregateSec > 0 ? aggregateCandles(sorted, aggregateSec) : sorted;
  });
}

// -------------------------------------------------------------
// Upstox Option Chain & Contracts
// -------------------------------------------------------------

export async function optionChain(symbol: string, expiry?: string): Promise<NormalizedOptionChain> {
  return tracked("upstox", async () => {
    const inst = resolveIndianInstrument(symbol);
    if (!inst) throw new Error(`Unknown Indian instrument: ${symbol}`);

    // 1. Fetch available expiries from option contracts endpoint
    const contractUrl = `${UPSTOX_BASE}/v2/option/contract?instrument_key=${encodeURIComponent(inst.instrumentKey)}`;
    const contractRes = await fetch(contractUrl, { headers: authHeaders() });
    if (!contractRes.ok) {
      throw new Error(`Upstox option contract error ${contractRes.status}`);
    }
    const contractJson = (await contractRes.json()) as any;
    const contracts = (contractJson.data ?? []) as any[];

    const expiries = [...new Set(contracts.map((c) => String(c.expiry)))].sort();
    if (expiries.length === 0) {
      throw new Error(`No option contracts available for ${symbol}`);
    }

    const selectedExpiry = expiry && expiries.includes(expiry) ? expiry : expiries[0];

    // 2. Fetch Option Chain for selected expiry
    const chainUrl = `${UPSTOX_BASE}/v2/option/chain?instrument_key=${encodeURIComponent(inst.instrumentKey)}&expiry_date=${selectedExpiry}`;
    const chainRes = await fetch(chainUrl, { headers: authHeaders() });
    if (!chainRes.ok) {
      throw new Error(`Upstox option chain error ${chainRes.status}`);
    }
    const chainJson = (await chainRes.json()) as any;
    const rows = (chainJson.data ?? []) as any[];

    const underlyingPrice = rows[0]?.underlying_spot_price ?? 0;

    const strikes: NormalizedOptionStrikeRow[] = rows.map((r) => {
      const strikePrice = Number(r.strike_price);
      let call: any = undefined;
      let put: any = undefined;

      if (r.call_options) {
        const c = r.call_options;
        call = {
          instrumentKey: c.instrument_key,
          symbol: `${inst.symbol} ${strikePrice} CE`,
          strikePrice,
          type: "CE",
          expiry: selectedExpiry,
          ltp: Number(c.market_data?.ltp ?? 0),
          bid: Number(c.market_data?.bid_price ?? 0),
          ask: Number(c.market_data?.ask_price ?? 0),
          volume: Number(c.market_data?.volume ?? 0),
          oi: Number(c.market_data?.oi ?? 0),
          prevOi: Number(c.market_data?.prev_oi ?? 0),
          changeOi: Number(c.market_data?.oi ?? 0) - Number(c.market_data?.prev_oi ?? 0),
          greeks: c.option_greeks
            ? {
                iv: c.option_greeks.iv,
                delta: c.option_greeks.delta,
                gamma: c.option_greeks.gamma,
                theta: c.option_greeks.theta,
                vega: c.option_greeks.vega,
                pop: c.option_greeks.pop,
              }
            : undefined,
        };
      }

      if (r.put_options) {
        const p = r.put_options;
        put = {
          instrumentKey: p.instrument_key,
          symbol: `${inst.symbol} ${strikePrice} PE`,
          strikePrice,
          type: "PE",
          expiry: selectedExpiry,
          ltp: Number(p.market_data?.ltp ?? 0),
          bid: Number(p.market_data?.bid_price ?? 0),
          ask: Number(p.market_data?.ask_price ?? 0),
          volume: Number(p.market_data?.volume ?? 0),
          oi: Number(p.market_data?.oi ?? 0),
          prevOi: Number(p.market_data?.prev_oi ?? 0),
          changeOi: Number(p.market_data?.oi ?? 0) - Number(p.market_data?.prev_oi ?? 0),
          greeks: p.option_greeks
            ? {
                iv: p.option_greeks.iv,
                delta: p.option_greeks.delta,
                gamma: p.option_greeks.gamma,
                theta: p.option_greeks.theta,
                vega: p.option_greeks.vega,
                pop: p.option_greeks.pop,
              }
            : undefined,
        };
      }

      return {
        strikePrice,
        call,
        put,
      };
    });

    return {
      symbol: inst.symbol,
      underlyingPrice,
      availableExpiries: expiries,
      selectedExpiry,
      strikes: strikes.sort((a, b) => a.strikePrice - b.strikePrice),
      source: "upstox",
    };
  });
}

// -------------------------------------------------------------
// Upstox v3 Market Data Feed WebSocket Authorization
// -------------------------------------------------------------

export async function getMarketDataFeedUrl(): Promise<string> {
  const url = `${UPSTOX_BASE}/v3/feed/market-data-feed/authorize`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upstox feed authorize failed: ${err}`);
  }
  const json = (await res.json()) as any;
  const redirectUri = json.data?.authorizedRedirectUri;
  if (!redirectUri) throw new Error("No authorizedRedirectUri in Upstox response");
  return redirectUri;
}
