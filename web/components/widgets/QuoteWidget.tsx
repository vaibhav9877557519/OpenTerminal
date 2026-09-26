"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, fmt, fmtBig, pctClass, type Quote } from "../../lib/api";
import { useWidgetSymbol, type WidgetInstance } from "../../store/terminal";
import { useMarketStream } from "../../lib/useMarketStream";
import Flash from "../Flash";

type ShortVolume = { date: string; shortVolume: number; shortExemptVolume: number; totalVolume: number; shortVolumePercent: number };

export default function QuoteWidget({ widget }: { widget: WidgetInstance }) {
  const symbol = useWidgetSymbol(widget);
  const { tick, status: streamStatus } = useMarketStream(symbol);
  const { data, error } = useQuery({
    queryKey: ["quote", symbol],
    queryFn: async () => (await apiGet<Quote[]>(`/api/quotes?symbols=${symbol}`))[0],
    refetchInterval: 5_000,
  });
  // FINRA's Reg SHO file only updates once a day (next-morning), so no point polling it fast.
  const { data: shortVol } = useQuery({
    queryKey: ["short-volume", symbol],
    queryFn: () => apiGet<ShortVolume | null>(`/api/short-volume/${symbol}`),
    staleTime: 3_600_000,
  });

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-2 dim">Loading {symbol}…</div>;

  const displayPrice = tick?.price ?? data.price;
  const prevClose = data.previousClose ?? displayPrice;
  const change = displayPrice !== null && prevClose !== null ? displayPrice - prevClose : data.change;
  const changePercent = prevClose && change !== null && prevClose > 0 ? (change / prevClose) * 100 : data.changePercent;
  const displayBid = tick?.bid ?? data.bid;
  const displayAsk = tick?.ask ?? data.ask;
  const displayVolume = tick?.volume ?? data.volume;

  const rows: Array<[string, string, string?]> = [
    ["Open", fmt(data.open)],
    ["High", fmt(data.high)],
    ["Low", fmt(data.low)],
    ["Prev Close", fmt(data.previousClose)],
    ["Bid", fmt(displayBid)],
    ["Ask", fmt(displayAsk)],
    ["Volume", fmtBig(displayVolume)],
    ["Avg Vol 3M", fmtBig(data.avgVolume)],
    ...(shortVol ? ([["Short Vol %", fmt(shortVol.shortVolumePercent, 1) + "%"]] as Array<[string, string]>) : []),
    ["Mkt Cap", fmtBig(data.marketCap)],
    ["P/E (ttm)", fmt(data.pe)],
    ["EPS (ttm)", fmt(data.eps)],
    ["Div Yield", data.dividendYield !== null ? fmt(data.dividendYield * 100) + "%" : "—"],
    ["52W High", fmt(data.week52High)],
    ["52W Low", fmt(data.week52Low)],
    ["Beta", fmt(data.beta)],
    ["Shares Out", fmtBig(data.sharesOutstanding)],
  ];

  return (
    <div className="p-2">
      <div className="flex items-baseline gap-3 mb-1">
        <Flash value={displayPrice} className="text-xl font-bold">{fmt(displayPrice)}</Flash>
        <Flash value={changePercent} className={`${pctClass(changePercent)} text-sm`}>
          {change !== null && change >= 0 ? "+" : ""}
          {fmt(change)} ({fmt(changePercent)}%)
        </Flash>
        <span
          className={`text-[9px] px-1 py-0.5 rounded font-semibold ml-2 ${
            streamStatus === "LIVE"
              ? "bg-[#00c853]/20 text-[#00c853]"
              : streamStatus === "CLOSED"
              ? "bg-[#ff9900]/20 text-[#ff9900]"
              : "bg-[#808080]/20 text-[#808080]"
          }`}
        >
          ● {streamStatus}
        </span>
        <span className="dim text-[10px] ml-auto">
          {data.exchange ?? ""} · {data.currency ?? ""} · {data.source}
        </span>
      </div>
      <div className="dim text-[11px] mb-2 truncate">{data.name}</div>
      <div className="grid grid-cols-2 gap-x-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-[#161616] py-0.5">
            <span className="dim">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
