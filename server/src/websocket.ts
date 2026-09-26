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

export class MarketStreamServer {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, Set<string>>();
  private symbolSubscriberCount = new Map<string, number>();
  private activeCandles = new Map<string, ActiveCandle>();
  private pollIntervals = new Map<string, NodeJS.Timeout>();

  // Upstream connections
  private finnhubWs: WebSocket | null = null;
  private binanceWs: WebSocket | null = null;
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

    // Fast polling loop (1.5 seconds) ensuring continuous updates
    const timer = setInterval(async () => {
      await this.fetchAndBroadcast(symbol);
    }, 1500);

    this.pollIntervals.set(symbol, timer);

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
    this.activeCandles.delete(symbol);
  }

  private async pushImmediateQuote(symbol: string, targetWs?: WebSocket) {
    try {
      const quote = await getQuote(symbol);
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
        quote,
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
        quote,
        candle,
        latency,
        timestamp: t1,
      };

      this.broadcastToSubscribers(symbol, JSON.stringify(msg));
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
