import fs from "node:fs";
import path from "node:path";
import { tracked } from "./registry.js";
import type { NormalizedQuote, SearchResult } from "./types.js";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

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

export function getFinnhubKey(): string {
  const key = process.env.FINNHUB_API_KEY?.trim() || loadEnvKey("FINNHUB_API_KEY");
  if (!key) throw new Error("FINNHUB_API_KEY is not configured in .env");
  return key;
}

export function getFinnhubWsUrl(): string {
  return `wss://ws.finnhub.io?token=${getFinnhubKey()}`;
}

export async function quote(symbol: string): Promise<NormalizedQuote> {
  return tracked("finnhub", async () => {
    const key = getFinnhubKey();
    const cleanSym = symbol.trim().toUpperCase();
    const t0 = Date.now();
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(cleanSym)}&token=${key}`;
    const res = await fetch(url);
    const processingMs = Date.now() - t0;

    if (!res.ok) {
      throw new Error(`Finnhub quote error ${res.status}`);
    }

    const data = (await res.json()) as any;
    if (typeof data.c !== "number" || data.c === 0) {
      throw new Error(`No Finnhub quote for ${symbol}`);
    }

    const price = data.c;
    const change = data.d ?? null;
    const changePercent = data.dp ?? null;
    const high = data.h ?? null;
    const low = data.l ?? null;
    const open = data.o ?? null;
    const previousClose = data.pc ?? null;
    const providerTime = data.t ? data.t * 1000 : Date.now();

    return {
      symbol: cleanSym,
      name: cleanSym,
      assetType: "stock",
      price,
      bid: null,
      ask: null,
      mid: price,
      spread: null,
      change,
      changePercent,
      open,
      high,
      low,
      previousClose,
      volume: null,
      timestamp: providerTime,
      source: "finnhub",
      status: "LIVE",
      currency: "USD",
      exchange: "US",
      feedLatencyMs: processingMs,
    };
  });
}

export async function search(query: string): Promise<SearchResult[]> {
  const key = getFinnhubKey();
  const q = query.trim();
  if (!q) return [];
  const url = `${FINNHUB_BASE}/search?q=${encodeURIComponent(q)}&token=${key}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const json = (await res.json()) as any;
  const list = (json.result ?? []) as any[];

  return list.slice(0, 15).map((item) => ({
    symbol: item.symbol,
    name: item.description,
    assetType: item.type === "Common Stock" ? "stock" : "stock",
    exchange: item.type ?? "US",
    country: "US",
    source: "finnhub",
  }));
}
