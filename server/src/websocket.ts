import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type {
  NormalizedQuote,
  NormalizedCandle,
  LatencyReport,
  RealtimeTickMessage,
} from "./providers/types.js";
import { getQuote, detectProviderCategory } from "./providers/router.js";
import { getFinnhubWsUrl } from "./providers/finnhub.js";

interface ActiveCandle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickVolume: number;
}

interface ClientSubscription {
  ws: WebSocket;
  symbols: Set<string>;
}

export function getMarketTradingStatus(symbol: string): { status: "LIVE" | "CLOSED"; note?: string } {
  const cat = detectProviderCategory(symbol);
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 is Sunday, 6 is Saturday
  const utcHours = now.getUTCHours();
  const utcMins = now.getUTCMinutes();
  const utcTotal = utcHours * 60 + utcMins;

  if (cat === "crypto") {
    return { status: "LIVE", note: "Crypto trades 24/7 in real-time" };
  }

  if (cat === "forex") {
    // Forex closes Friday 21:00 UTC (5 PM EST) and opens Sunday 21:00 UTC
    const isFridayAfterClose = dayOfWeek === 5 && utcTotal >= 21 * 60;
    const isSaturday = dayOfWeek === 6;
    const isSundayBeforeOpen = dayOfWeek === 0 && utcTotal < 21 * 60;
    if (isFridayAfterClose || isSaturday || isSundayBeforeOpen) {
      return {
        status: "CLOSED",
        note: "Forex market is closed for the weekend (reopens Sunday 5:00 PM EST). Switch to Crypto (e.g. BTCUSDT) for 24/7 real-time streaming.",
      };
    }
    return { status: "LIVE" };
  }

  if (cat === "upstox") {
    // Indian market: IST is UTC+5:30. Trading hours: Mon-Fri 09:15 to 15:30 IST (03:45 to 10:00 UTC)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        status: "CLOSED",
        note: "Indian markets (NSE/BSE) are closed for the weekend (reopens Monday 09:15 IST). Switch to Crypto (e.g. BTCUSDT) for 24/7 streaming.",
      };
    }
    if (utcTotal < 3 * 60 + 45 || utcTotal > 10 * 60) {
      return {
        status: "CLOSED",
        note: "Indian markets are outside standard trading hours (09:15 - 15:30 IST).",
      };
    }
    return { status: "LIVE" };
  }

  // US stocks: Mon-Fri 09:30 to 16:00 EST (13:30 to 20:00 UTC)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      status: "CLOSED",
      note: "US stock markets are closed for the weekend (reopens Monday 09:30 EST). Switch to Crypto (e.g. BTCUSDT) for 24/7 streaming.",
    };
  }
  return { status: "LIVE" };
}

export class MarketStreamServer {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, Set<string>>();
  private symbolSubscriberCount = new Map<string, number>();
  private activeCandles = new Map<string, ActiveCandle>();
  private pollIntervals = new Map<string, NodeJS.Timeout>();

  // Upstream connections
  private finnhubWs: WebSocket | null = null;
  private binanceStreams = new Map<string, WebSocket>();
  private upstreamActive = false;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.init();
  }

  private init() {
    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.set(ws, new Set());

      // Send initial connection welcome & heartbeat setup
      ws.send(JSON.stringify({ type: "status", status: "CONNECTED", timestamp: Date.now() }));

      ws.on("message", (raw: string) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleClientMessage(ws, msg);
        } catch {}
      });

      ws.on("close", () => {
        const subs = this.clients.get(ws);
        if (subs) {
          for (const s of subs) {
            this.decrementSubscription(s);
          }
        }
        this.clients.delete(ws);
      });

      ws.on("error", () => {
        ws.close();
      });
    });

    // Setup periodic upstream health check
    setInterval(() => this.heartbeat(), 30_000);
  }

  private handleClientMessage(ws: WebSocket, msg: any) {
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      return;
    }

    const action = msg.action || msg.type;

    if (action === "subscribe" && typeof msg.symbol === "string") {
      const symbol = msg.symbol.trim().toUpperCase();
      const subs = this.clients.get(ws);
      if (subs && !subs.has(symbol)) {
        subs.add(symbol);
        this.incrementSubscription(symbol);
        ws.send(JSON.stringify({ type: "subscribed", symbol, timestamp: Date.now() }));

        // Send an immediate quote tick so UI updates instantly
        this.pushImmediateQuote(symbol, ws);
      }
    }

    if (action === "unsubscribe" && typeof msg.symbol === "string") {
      const symbol = msg.symbol.trim().toUpperCase();
      const subs = this.clients.get(ws);
      if (subs && subs.has(symbol)) {
        subs.delete(symbol);
        this.decrementSubscription(symbol);
        ws.send(JSON.stringify({ type: "unsubscribed", symbol, timestamp: Date.now() }));
      }
    }
  }

  private incrementSubscription(symbol: string) {
    const cur = this.symbolSubscriberCount.get(symbol) ?? 0;
    this.symbolSubscriberCount.set(symbol, cur + 1);

    if (cur === 0) {
      // First subscriber: start streaming/polling loop for this symbol
      this.startSymbolStream(symbol);
    }
  }

  private decrementSubscription(symbol: string) {
    const cur = this.symbolSubscriberCount.get(symbol) ?? 0;
    if (cur <= 1) {
      this.symbolSubscriberCount.delete(symbol);
      this.stopSymbolStream(symbol);
    } else {
      this.symbolSubscriberCount.set(symbol, cur - 1);
    }
  }

  private startSymbolStream(symbol: string) {
    const cat = detectProviderCategory(symbol);

    // Fast polling loop (1.0 second) ensuring continuous 1-second price engagement
    const timer = setInterval(async () => {
      await this.fetchAndBroadcast(symbol);
    }, 1000);

    this.pollIntervals.set(symbol, timer);

    // If Crypto, connect directly to Binance trade stream for sub-second real-time trades
    if (cat === "crypto") {
      this.ensureBinanceWs(symbol);
    }

    // If Finnhub US stock, also subscribe to Finnhub WS if active
    if (cat === "us_stock") {
      this.ensureFinnhubWs(symbol);
    }
  }

  private stopSymbolStream(symbol: string) {
    const timer = this.pollIntervals.get(symbol);
    if (timer) {
      clearInterval(timer);
      this.pollIntervals.delete(symbol);
    }
    const bws = this.binanceStreams.get(symbol);
    if (bws) {
      bws.close();
      this.binanceStreams.delete(symbol);
    }
    this.activeCandles.delete(symbol);
  }

  private async pushImmediateQuote(symbol: string, targetWs?: WebSocket) {
    try {
      const quote = await getQuote(symbol);
      const mStatus = getMarketTradingStatus(symbol);
      const now = Date.now();
      const latency: LatencyReport = {
        symbol,
        source: quote.source,
        providerTimestamp: quote.timestamp,
        receivedTimestamp: now,
        processingTimestamp: now,
        feedLatencyMs: quote.feedLatencyMs ?? null,
        backendLatencyMs: 1,
      };

      const candle = this.updateIncrementalCandle(symbol, quote.price, quote.volume ?? 0);

      const msg: RealtimeTickMessage = {
        type: "tick",
        symbol,
        price: quote.price,
        bid: quote.bid,
        ask: quote.ask,
        volume: quote.volume,
        tickVolume: quote.tickVolume,
        status: mStatus.status,
        marketNote: mStatus.note,
        quote: {
          ...quote,
          status: mStatus.status,
        },
        candle,
        latency,
        timestamp: now,
      };

      const payload = JSON.stringify(msg);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(payload);
      } else {
        this.broadcastToSubscribers(symbol, payload);
      }
    } catch {}
  }


  private async fetchAndBroadcast(symbol: string) {
    if (!this.symbolSubscriberCount.has(symbol)) return;

    try {
      const t0 = Date.now();
      const quote = await getQuote(symbol);
      const t1 = Date.now();
      const mStatus = getMarketTradingStatus(symbol);

      const latency: LatencyReport = {
        symbol,
        source: quote.source,
        providerTimestamp: quote.timestamp,
        receivedTimestamp: t0,
        processingTimestamp: t1,
        feedLatencyMs: quote.feedLatencyMs ?? Math.max(0, t0 - quote.timestamp),
        backendLatencyMs: Math.max(1, t1 - t0),
      };

      const candle = this.updateIncrementalCandle(symbol, quote.price, quote.volume ?? 0);

      const msg: RealtimeTickMessage = {
        type: "tick",
        symbol,
        price: quote.price,
        bid: quote.bid,
        ask: quote.ask,
        volume: quote.volume,
        tickVolume: quote.tickVolume,
        status: mStatus.status,
        marketNote: mStatus.note,
        quote: {
          ...quote,
          status: mStatus.status,
        },
        candle,
        latency,
        timestamp: t1,
      };

      this.broadcastToSubscribers(symbol, JSON.stringify(msg));
    } catch {}
  }

  private ensureBinanceWs(symbol: string) {
    if (this.binanceStreams.has(symbol)) return;
    const clean = symbol.toLowerCase().replace(/[\/\s_-]/g, "");
    const pair = clean.endsWith("usdt") ? clean : clean + "usdt";
    const wsUrl = `wss://stream.binance.com:9443/ws/${pair}@trade`;

    try {
      const ws = new WebSocket(wsUrl);
      this.binanceStreams.set(symbol, ws);

      ws.on("message", (raw: any) => {
        try {
          const trade = JSON.parse(raw.toString());
          if (!trade.p || !this.symbolSubscriberCount.has(symbol)) return;

          const price = parseFloat(trade.p);
          const qty = parseFloat(trade.q || "0");
          const tradeTime = trade.T || Date.now();
          const now = Date.now();

          const candle = this.updateIncrementalCandle(symbol, price, qty);
          const latency: LatencyReport = {
            symbol,
            source: "binance-ws",
            providerTimestamp: tradeTime,
            receivedTimestamp: now,
            processingTimestamp: now,
            feedLatencyMs: Math.max(0, now - tradeTime),
            backendLatencyMs: 1,
          };

          const msg: RealtimeTickMessage = {
            type: "tick",
            symbol,
            price,
            volume: qty,
            status: "LIVE",
            marketNote: "Crypto trades 24/7 in real-time",
            candle,
            latency,
            timestamp: now,
          };

          this.broadcastToSubscribers(symbol, JSON.stringify(msg));
        } catch {}
      });

      ws.on("error", () => {
        ws.close();
      });

      ws.on("close", () => {
        this.binanceStreams.delete(symbol);
        if (this.symbolSubscriberCount.has(symbol)) {
          setTimeout(() => this.ensureBinanceWs(symbol), 3000);
        }
      });
    } catch {}
  }


  /**
   * Incremental Live Candle Engine
   * Updates Open/High/Low/Close incrementally on every tick without reloading the chart.
   */
  private updateIncrementalCandle(symbol: string, price: number, volume: number): NormalizedCandle {
    const nowSec = Math.floor(Date.now() / 1000);
    // Align to 1-minute candle boundaries
    const candleBucket = Math.floor(nowSec / 60) * 60;

    let active = this.activeCandles.get(symbol);

    if (!active || active.time !== candleBucket) {
      // New candle period started
      active = {
        time: candleBucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume,
        tickVolume: 1,
      };
      this.activeCandles.set(symbol, active);
    } else {
      // Update existing candle incrementally
      active.high = Math.max(active.high, price);
      active.low = Math.min(active.low, price);
      active.close = price;
      active.volume = volume;
      active.tickVolume += 1;
    }

    return {
      time: active.time,
      open: active.open,
      high: active.high,
      low: active.low,
      close: active.close,
      volume: active.volume,
      tickVolume: active.tickVolume,
    };
  }

  private broadcastToSubscribers(symbol: string, payload: string) {
    for (const [ws, subs] of this.clients.entries()) {
      if (subs.has(symbol) && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  private ensureFinnhubWs(symbol: string) {
    try {
      if (!this.finnhubWs || this.finnhubWs.readyState === WebSocket.CLOSED) {
        const url = getFinnhubWsUrl();
        this.finnhubWs = new WebSocket(url);

        this.finnhubWs.on("open", () => {
          this.finnhubWs?.send(JSON.stringify({ type: "subscribe", symbol }));
        });

        this.finnhubWs.on("message", (data: any) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === "trade" && Array.isArray(parsed.data)) {
              for (const trade of parsed.data) {
                if (trade.s && this.symbolSubscriberCount.has(trade.s)) {
                  const candle = this.updateIncrementalCandle(trade.s, trade.p, trade.v ?? 0);
                  const latency: LatencyReport = {
                    symbol: trade.s,
                    source: "finnhub-ws",
                    providerTimestamp: trade.t,
                    receivedTimestamp: Date.now(),
                    processingTimestamp: Date.now(),
                    feedLatencyMs: Math.max(0, Date.now() - trade.t),
                    backendLatencyMs: 1,
                  };
                  const msg: RealtimeTickMessage = {
                    type: "tick",
                    symbol: trade.s,
                    candle,
                    latency,
                    timestamp: Date.now(),
                  };
                  this.broadcastToSubscribers(trade.s, JSON.stringify(msg));
                }
              }
            }
          } catch {}
        });

        this.finnhubWs.on("error", () => {});
      } else if (this.finnhubWs.readyState === WebSocket.OPEN) {
        this.finnhubWs.send(JSON.stringify({ type: "subscribe", symbol }));
      }
    } catch {}
  }

  private heartbeat() {
    const ping = JSON.stringify({ type: "status", status: "HEARTBEAT", timestamp: Date.now() });
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(ping);
      }
    }
  }
}
