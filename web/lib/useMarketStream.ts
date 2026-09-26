"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface LatencyData {
  source: string;
  feedLatencyMs: number | null;
  backendLatencyMs: number | null;
  frontendLatencyMs: number | null;
  totalLatencyMs: number | null;
}

export type DataStatus = "LIVE" | "DELAYED" | "INDICATIVE" | "STALE" | "OFFLINE" | "UNAVAILABLE" | "CLOSED";

export interface StreamTick {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  tickVolume?: number | null;
  timestamp: number;
  marketNote?: string;
  candle: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    tickVolume?: number;
  };
  latency: LatencyData;
  status: DataStatus;
}

function isSameSymbol(s1?: string | null, s2?: string | null): boolean {
  if (!s1 || !s2) return false;
  return s1.toUpperCase().replace(/[\/\s_-]/g, "") === s2.toUpperCase().replace(/[\/\s_-]/g, "");
}

export function useMarketStream(symbol: string | null) {
  const [tick, setTick] = useState<StreamTick | null>(null);
  const [status, setStatus] = useState<DataStatus>("OFFLINE");
  const [latency, setLatency] = useState<LatencyData>({
    source: "Connecting...",
    feedLatencyMs: null,
    backendLatencyMs: null,
    frontendLatencyMs: null,
    totalLatencyMs: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const activeSymbolRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const lastTickTimeRef = useRef<number>(Date.now());

  // Stale detection timer (if no tick received for 10s on active subscription)
  useEffect(() => {
    const timer = setInterval(() => {
      if (status === "LIVE" && Date.now() - lastTickTimeRef.current > 10_000) {
        setStatus("STALE");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    activeSymbolRef.current = symbol;
    if (!symbol) return;

    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname || "127.0.0.1";
      const wsUrl = `${protocol}//${host}:4000/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed) return;
        setStatus("LIVE");
        if (activeSymbolRef.current) {
          ws.send(JSON.stringify({ action: "subscribe", symbol: activeSymbolRef.current }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "tick") {
            const rawTick = msg.tick || msg;
            if (!isSameSymbol(rawTick.symbol, activeSymbolRef.current)) return;

            const tNow = Date.now();
            lastTickTimeRef.current = tNow;
            const frontendLatency = Math.max(0, tNow - (rawTick.timestamp || tNow));
            const feedMs = rawTick.latency?.feedLatencyMs ?? null;
            const backendMs = rawTick.latency?.backendLatencyMs ?? null;
            const totalMs = (feedMs || 0) + (backendMs || 0) + frontendLatency;

            const latReport: LatencyData = {
              source: rawTick.latency?.source ?? rawTick.source ?? "provider",
              feedLatencyMs: feedMs,
              backendLatencyMs: backendMs,
              frontendLatencyMs: frontendLatency,
              totalLatencyMs: totalMs > 0 ? totalMs : null,
            };

            setLatency(latReport);
            setStatus(rawTick.quote?.status ?? rawTick.status ?? "LIVE");

            const price = rawTick.price ?? rawTick.quote?.price ?? rawTick.candle?.close ?? 0;

            setTick({
              symbol: rawTick.symbol,
              price,
              bid: rawTick.bid ?? rawTick.quote?.bid ?? null,
              ask: rawTick.ask ?? rawTick.quote?.ask ?? null,
              volume: rawTick.volume ?? rawTick.quote?.volume ?? rawTick.candle?.volume ?? null,
              tickVolume: rawTick.tickVolume ?? rawTick.quote?.tickVolume ?? rawTick.candle?.tickVolume ?? null,
              timestamp: rawTick.timestamp || tNow,
              marketNote: rawTick.marketNote,
              candle: rawTick.candle,
              latency: latReport,
              status: rawTick.quote?.status ?? rawTick.status ?? "LIVE",
            });
          }
        } catch {
          // ignore malformed message
        }
      };

      ws.onerror = () => {
        setStatus("OFFLINE");
      };

      ws.onclose = () => {
        setStatus("OFFLINE");
        if (!destroyed) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (activeSymbolRef.current) {
          wsRef.current.send(JSON.stringify({ action: "unsubscribe", symbol: activeSymbolRef.current }));
        }
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [symbol]);

  return { tick, status, latency };
}
