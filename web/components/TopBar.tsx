"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { useTerminal } from "../store/terminal";

type Status = {
  ok: boolean;
  providers: Array<{ name: string; ok: number; failed: number; lastLatencyMs: number | null }>;
  ai: boolean;
};

function Clock({ tz, label }: { tz: string; label: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="dim">
      {label}{" "}
      <span className="text-[var(--text)]">
        {now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false })}
      </span>
    </span>
  );
}

function getMarketSessions() {
  const now = new Date();

  // NYC (America/New_York)
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const nyDay = ny.getDay();
  const nyMins = ny.getHours() * 60 + ny.getMinutes();
  const nyOpen = nyDay >= 1 && nyDay <= 5 && nyMins >= 570 && nyMins < 960; // 09:30–16:00 EST

  // Mumbai (Asia/Kolkata)
  const bom = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const bomDay = bom.getDay();
  const bomMins = bom.getHours() * 60 + bom.getMinutes();
  const bomOpen = bomDay >= 1 && bomDay <= 5 && bomMins >= 555 && bomMins < 930; // 09:15–15:30 IST

  // Forex (UTC: Sun 21:00 to Fri 21:00)
  const utcDay = now.getUTCDay();
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const fxOpen = !(
    (utcDay === 5 && utcMins >= 21 * 60) || // Friday after 5pm EST
    utcDay === 6 || // Saturday
    (utcDay === 0 && utcMins < 21 * 60) // Sunday before 5pm EST
  );

  return {
    ny: { label: nyOpen ? "NYSE OPEN" : "NYSE CLOSED", open: nyOpen },
    nse: { label: bomOpen ? "NSE OPEN" : "NSE CLOSED", open: bomOpen },
    fx: { label: fxOpen ? "FX OPEN" : "FX CLOSED", open: fxOpen },
    crypto: { label: "CRYPTO 24/7", open: true },
  };
}

function getActiveSymbolMarket(sym: string): { label: string; open: boolean } {
  const s = sym.toUpperCase();
  const sessions = getMarketSessions();

  if (s.endsWith("USDT") || s.includes("BTC") || s.includes("ETH") || s.includes("SOL")) {
    return { label: "CRYPTO LIVE (24/7)", open: true };
  }
  if (s.includes("/") || s.includes("=") || s.length === 6) {
    return { label: sessions.fx.open ? "FX OPEN" : "FX CLOSED (Weekend)", open: sessions.fx.open };
  }
  if (
    s.includes("NIFTY") ||
    s.includes("BANK") ||
    s.includes("RELIANCE") ||
    s.includes("TCS") ||
    s.includes("HDFC") ||
    s.includes("INFY") ||
    s.includes("VIX")
  ) {
    return { label: sessions.nse.open ? "NSE OPEN" : "NSE CLOSED (Weekend)", open: sessions.nse.open };
  }
  return { label: sessions.ny.open ? "NYSE OPEN" : "NYSE CLOSED (Weekend)", open: sessions.ny.open };
}

export default function TopBar() {
  const setCommandOpen = useTerminal((s) => s.setCommandOpen);
  const activeSymbol = useTerminal((s) => s.activeSymbol);
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => apiGet<Status>("/api/status"),
    refetchInterval: 30_000,
  });

  const sessions = getMarketSessions();
  const activeMarket = getActiveSymbolMarket(activeSymbol);
  const healthy = status?.providers.filter((p) => p.ok > 0) ?? [];

  return (
    <header className="flex items-center gap-3 px-3 h-8 bg-[var(--panel-2)] border-b border-[var(--border)] text-[11px] shrink-0 flex-wrap">
      <span className="amber font-bold tracking-widest text-[12px]">OPENTERMINAL</span>

      {/* Global Market Status Badges */}
      <div className="flex items-center gap-2 border-r border-[var(--border)] pr-3 text-[10px]">
        <span className={sessions.nse.open ? "up" : "down"}>● {sessions.nse.label}</span>
        <span className={sessions.ny.open ? "up" : "down"}>● {sessions.ny.label}</span>
        <span className={sessions.fx.open ? "up" : "down"}>● {sessions.fx.label}</span>
        <span className="text-[#00c853] font-semibold">● CRYPTO 24/7</span>
      </div>

      {/* Financial Hub Clocks */}
      <div className="flex items-center gap-2.5 text-[10px]">
        <Clock tz="Asia/Kolkata" label="MUM" />
        <Clock tz="America/New_York" label="NY" />
        <Clock tz="Europe/London" label="LDN" />
        <Clock tz="Asia/Tokyo" label="TYO" />
      </div>

      {/* Command Palette Search Button with active asset market state */}
      <button
        className="term-btn flex-1 max-w-sm text-left dim flex items-center justify-between px-2 py-0.5"
        onClick={() => setCommandOpen(true)}
      >
        <span>
          <strong className="text-[var(--text)]">{activeSymbol}</strong> — search symbol…
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${activeMarket.open ? "bg-[#00c853]/20 text-[#00c853]" : "bg-[#ff9900]/20 text-[#ff9900]"}`}>
            {activeMarket.label}
          </span>
          <span className="text-[10px]">⌘K</span>
        </span>
      </button>

      <span className="dim ml-auto text-[10px]">
        feeds:{" "}
        {healthy.length > 0
          ? healthy.map((p) => `${p.name} ${p.lastLatencyMs ?? "—"}ms`).join(" · ")
          : "upstox · finnhub · binance"}
      </span>
      <span className={status?.ai ? "up text-[10px]" : "dim text-[10px]"}>AI {status?.ai ? "●" : "○"}</span>
    </header>
  );
}
