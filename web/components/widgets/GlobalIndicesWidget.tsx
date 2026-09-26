"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, fmt, pctClass } from "../../lib/api";
import { useTerminal } from "../../store/terminal";
import Flash from "../Flash";

interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  exchange: string;
  source: string;
}

const REGIONS = ["ALL", "INDIA", "USA", "EUROPE", "ASIA"] as const;
type Region = (typeof REGIONS)[number];

export default function GlobalIndicesWidget() {
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const [region, setRegion] = useState<Region>("ALL");

  const { data: indices = [], isLoading } = useQuery({
    queryKey: ["indices", "all"],
    queryFn: () => apiGet<IndexQuote[]>("/api/indices"),
    refetchInterval: 10_000,
  });

  const filtered = region === "ALL" ? indices : indices.filter((idx) => idx.exchange.toUpperCase() === region);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-[11px]">
      <div className="flex items-center justify-between p-1 bg-[#111] border-b border-[#262626]">
        <span className="font-bold text-[#ff9900]">GLOBAL INDICES</span>
        <div className="flex gap-1">
          {REGIONS.map((r) => (
            <button
              key={r}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                region === r ? "bg-[#ff9900] text-black font-bold" : "text-[#808080] hover:text-white"
              }`}
              onClick={() => setRegion(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="p-2 dim">Fetching global benchmark indices…</div>}

      <div className="flex-1 overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="!text-left">Index</th>
              <th className="!text-left">Name</th>
              <th>Price</th>
              <th>Chg%</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((idx) => (
              <tr
                key={idx.symbol}
                onClick={() => setActiveSymbol(idx.symbol)}
                className="hover:bg-[#161616] cursor-pointer"
              >
                <td className="font-bold text-[#ff9900] !text-left">{idx.symbol}</td>
                <td className="!text-left text-[#d9d9d9] truncate max-w-[140px]">{idx.name}</td>
                <td>
                  <Flash value={idx.price}>{fmt(idx.price)}</Flash>
                </td>
                <td className={pctClass(idx.changePercent)}>
                  <Flash value={idx.changePercent}>
                    {idx.changePercent !== null ? `${fmt(idx.changePercent)}%` : "—"}
                  </Flash>
                </td>
                <td className="dim text-[10px]">{idx.exchange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
