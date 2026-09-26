"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import { useTerminal } from "../store/terminal";

type SearchResult = {
  symbol: string;
  name: string;
  exchange?: string;
  assetType?: string;
  type?: string;
  country?: string;
};

export default function CommandPalette() {
  const open = useTerminal((s) => s.commandOpen);
  const setOpen = useTerminal((s) => s.setCommandOpen);
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const addToWatchlist = useTerminal((s) => s.addToWatchlist);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["search", query],
    queryFn: () => apiGet<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled: open && query.trim().length > 0,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSelected(0), [results.length]);

  if (!open) return null;

  const pick = (r: SearchResult, watch = false) => {
    setActiveSymbol(r.symbol);
    if (watch) addToWatchlist(r.symbol);
    setOpen(false);
  };

  const getAssetBadge = (r: SearchResult) => {
    const type = (r.assetType || r.type || "").toLowerCase();
    if (type.includes("index")) return { text: "INDEX", color: "bg-[#80cbc4]/20 text-[#80cbc4] border-[#80cbc4]/40" };
    if (type.includes("forex") || r.exchange === "FOREX") return { text: "FOREX", color: "bg-[#ba68c8]/20 text-[#ba68c8] border-[#ba68c8]/40" };
    if (type.includes("crypto") || r.exchange === "BINANCE") return { text: "CRYPTO", color: "bg-[#ffd966]/20 text-[#ffd966] border-[#ffd966]/40" };
    if (r.country === "IN" || r.exchange === "NSE" || r.exchange === "BSE") return { text: "INDIA", color: "bg-[#ff9900]/20 text-[#ff9900] border-[#ff9900]/40" };
    return { text: "EQUITY", color: "bg-[#4fc3f7]/20 text-[#4fc3f7] border-[#4fc3f7]/40" };
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[620px] bg-[var(--panel)] border border-[var(--amber-dim)] shadow-2xl rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3 py-2 border-b border-[var(--border)] bg-[#111]">
          <span className="text-[#ff9900] mr-2 font-bold">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, results.length - 1));
              if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
              if (e.key === "Enter" && results[selected]) pick(results[selected], e.shiftKey);
            }}
            placeholder="Search Indian stocks (RELIANCE, TCS), NIFTY, Forex (EUR/USD), Crypto (BTCUSDT), US (AAPL)…"
            className="w-full !border-0 bg-transparent text-[13px] text-white outline-none"
          />
        </div>
        <div className="max-h-96 overflow-auto">
          {results.map((r, i) => {
            const badge = getAssetBadge(r);
            return (
              <div
                key={r.symbol + i}
                onClick={() => pick(r)}
                className={`px-3 py-2 flex items-center gap-3 cursor-pointer border-b border-[#161616] ${
                  i === selected ? "bg-[#1f1a10] text-[var(--amber)]" : "hover:bg-[#161616]"
                }`}
              >
                <span className="w-28 font-bold text-[12px]">{r.symbol}</span>
                <span className="flex-1 truncate text-[11px] text-[#d9d9d9]">{r.name}</span>
                <span className={`px-1.5 py-0.5 text-[9px] rounded font-semibold border ${badge.color}`}>
                  {badge.text}
                </span>
                <span className="dim text-[10px] w-14 text-right">{r.exchange}</span>
              </div>
            );
          })}
          {query && results.length === 0 && (
            <div className="px-3 py-4 dim text-center">No instruments found matching “{query}”</div>
          )}
        </div>
        <div className="px-3 py-1.5 bg-[#0d0d0d] border-t border-[#1f1f1f] flex justify-between text-[10px] text-[#666]">
          <span>Press Enter to view chart · Shift+Enter to add to watchlist</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}
