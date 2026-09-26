"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";

interface CurrencyScore {
  currency: string;
  strength: number;
  rating: "Strong" | "Moderate" | "Weak";
  color: string;
}

export default function CurrencyStrengthWidget() {
  const { data: scores = [], isLoading } = useQuery({
    queryKey: ["forex", "strength"],
    queryFn: () => apiGet<CurrencyScore[]>("/api/forex/strength"),
    refetchInterval: 15_000,
  });

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] p-2 overflow-auto text-[11px]">
      <div className="flex items-center justify-between pb-1 mb-2 border-b border-[#262626]">
        <span className="font-bold text-[#ff9900]">CURRENCY STRENGTH METER</span>
        <span className="dim text-[10px]">8 Major Currencies</span>
      </div>

      {isLoading && <div className="dim p-2">Computing relative currency strength…</div>}

      <div className="flex flex-col gap-2">
        {scores.map((s) => {
          const widthPct = Math.min(100, Math.abs(s.strength));
          return (
            <div key={s.currency} className="flex items-center gap-2 bg-[#121212] p-1.5 rounded border border-[#1f1f1f]">
              <span className="font-bold w-12 text-[#ff9900] text-[12px]">{s.currency}</span>
              <div className="flex-1 h-3 bg-[#1e1e1e] rounded overflow-hidden relative">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: s.color,
                    marginLeft: s.strength < 0 ? "auto" : undefined,
                  }}
                />
              </div>
              <span className="w-10 text-right font-mono" style={{ color: s.color }}>
                {s.strength > 0 ? "+" : ""}
                {s.strength}
              </span>
              <span
                className="w-16 text-center text-[9px] px-1 py-0.5 rounded font-semibold"
                style={{
                  backgroundColor: `${s.color}20`,
                  color: s.color,
                  border: `1px solid ${s.color}40`,
                }}
              >
                {s.rating}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-3 border-t border-[#1f1f1f] text-[9px] dim">
        <strong>Methodology:</strong> Aggregated multi-pair daily relative price change across 10 major and cross Forex pairs, normalized onto a [-100, +100] scale. Informational only.
      </div>
    </div>
  );
}
