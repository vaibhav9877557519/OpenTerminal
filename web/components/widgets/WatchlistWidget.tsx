"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, fmt, fmtBig, pctClass, type Quote } from "../../lib/api";
import { useTerminal } from "../../store/terminal";
import Flash from "../Flash";

const WATCHLIST_CATEGORIES = [
  {
    id: "indian_stocks",
    name: "Indian Stocks",
    symbols: ["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "BHARTIARTL", "ITC", "LT", "MARUTI"],
  },
  {
    id: "indices",
    name: "NIFTY & Indices",
    symbols: ["NIFTY", "BANKNIFTY", "INDIAVIX", "SENSEX", "SPX", "NDX", "DAX", "FTSE"],
  },
  {
    id: "forex",
    name: "Forex",
    symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "USD/INR", "AUD/USD", "USD/CAD", "USD/CHF", "EUR/GBP"],
  },
  {
    id: "crypto",
    name: "Crypto",
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"],
  },
  {
    id: "us_stocks",
    name: "US Stocks",
    symbols: ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL", "TSLA", "META"],
  },
  {
    id: "custom",
    name: "My Watchlist",
    symbols: [],
  },
];

export default function WatchlistWidget() {
  const terminalWatchlist = useTerminal((s) => s.watchlist);
  const addToWatchlist = useTerminal((s) => s.addToWatchlist);
  const removeFromWatchlist = useTerminal((s) => s.removeFromWatchlist);
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const [activeTab, setActiveTab] = useState<string>("indian_stocks");
  const [input, setInput] = useState("");

  const currentCategory = WATCHLIST_CATEGORIES.find((c) => c.id === activeTab);
  const activeSymbols = activeTab === "custom" ? terminalWatchlist : currentCategory?.symbols ?? [];

  const { data = [] } = useQuery({
    queryKey: ["watchlist", activeTab, activeSymbols.join(",")],
    queryFn: () => apiGet<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(activeSymbols.join(","))}`),
    enabled: activeSymbols.length > 0,
    refetchInterval: 2_000,
  });

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Category Tabs */}
      <div className="flex gap-1 p-1 bg-[#111111] border-b border-[#262626] overflow-x-auto text-[10px]">
        {WATCHLIST_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`px-2 py-0.5 rounded whitespace-nowrap ${
              activeTab === cat.id
                ? "bg-[#ff9900] text-black font-bold"
                : "text-[#808080] hover:text-white hover:bg-[#1a1a1a]"
            }`}
            onClick={() => setActiveTab(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Add Ticker Form */}
      <form
        className="flex gap-1 p-1 border-b border-[#1f1f1f]"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            addToWatchlist(input.trim().toUpperCase());
            setActiveTab("custom");
            setInput("");
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add ticker to My Watchlist…"
          className="flex-1 text-[11px]"
        />
        <button className="term-btn active" type="submit">
          + ADD
        </button>
      </form>

      {/* Watchlist Table */}
      <div className="flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="!text-left">Symbol</th>
              <th>Last</th>
              <th>Chg%</th>
              <th>Exchange</th>
              <th>Vol</th>
              {activeTab === "custom" && <th></th>}
            </tr>
          </thead>
          <tbody>
            {activeSymbols.map((sym) => {
              const q = data.find((d) => d.symbol.toUpperCase() === sym.toUpperCase() || d.symbol.replace(/[\/\s=X]/g, "") === sym.replace(/[\/\s=X]/g, ""));
              return (
                <tr key={sym} onClick={() => setActiveSymbol(sym)} className="hover:bg-[#161616] cursor-pointer">
                  <td className="font-bold text-[11px] text-[#ff9900] !text-left">{sym}</td>
                  <td>
                    <Flash value={q?.price}>{fmt(q?.price)}</Flash>
                  </td>
                  <td className={pctClass(q?.changePercent)}>
                    <Flash value={q?.changePercent}>{fmt(q?.changePercent)}%</Flash>
                  </td>
                  <td className="dim text-[10px]">{q?.exchange ?? "—"}</td>
                  <td>{fmtBig(q?.volume || (q as any)?.tickVolume)}</td>
                  {activeTab === "custom" && (
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromWatchlist(sym);
                        }}
                        className="dim hover:text-[var(--down)] text-[10px] px-1"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
