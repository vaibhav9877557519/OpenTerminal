"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  BarSeries,
  BaselineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
} from "lightweight-charts";
import { apiGet, fmt, fmtBig, type Candle } from "../../lib/api";
import {
  sma,
  ema,
  wma,
  vwap,
  rsi,
  macd,
  bollinger,
  atr,
  stochastic,
  obv,
  volumeMa,
  type Point,
  type PriceSource,
} from "../../lib/indicators";
import { detectCandlestickPatterns, detectChartPatterns, computeMTF, type DetectedPattern } from "../../lib/patterns";
import { useMarketStream, type LatencyData, type DataStatus } from "../../lib/useMarketStream";
import {
  loadDrawings,
  saveDrawings,
  loadLayouts,
  saveLayouts,
  loadAlerts,
  saveAlerts,
  FIBONACCI_LEVELS,
  type DrawingToolType,
  type DrawingItem,
  type ChartAlert,
  type SavedLayout,
} from "../../lib/chartDrawings";
import { useWidgetSymbol, type WidgetInstance } from "../../store/terminal";

const RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;
const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "45m", "1H", "2H", "4H", "1D", "1W", "1M"] as const;
const CHART_TYPES = ["candles", "bars", "line", "area", "baseline", "heikin_ashi"] as const;
const INDICATOR_LIST = ["SMA", "EMA", "WMA", "VWAP", "BOLL", "RSI", "MACD", "ATR", "STOCH", "OBV", "VOL_MA"] as const;

type Range = (typeof RANGES)[number];
type Timeframe = (typeof TIMEFRAMES)[number];
type ChartType = (typeof CHART_TYPES)[number];
type IndicatorType = (typeof INDICATOR_LIST)[number];

const ts = (t: number) => t as UTCTimestamp;
const toMap = (pts: Point[]) => new Map(pts.map((p) => [p.time, p.value]));

const INDICATOR_COLOR: Record<string, string> = {
  SMA: "#ffd966",
  EMA: "#ff8a65",
  WMA: "#4db6ac",
  VWAP: "#80cbc4",
  BOLL: "#ff9900",
  RSI: "#ba68c8",
  MACD: "#4fc3f7",
  ATR: "#ffb74d",
  STOCH: "#81c784",
  OBV: "#64b5f6",
  VOL_MA: "#aed581",
};

// Calculate Heikin Ashi candles
function computeHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const ha: Candle[] = [];
  let prevHA: Candle | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    const candleHA: Candle = {
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    };
    ha.push(candleHA);
    prevHA = candleHA;
  }
  return ha;
}

export default function ChartWidget({ widget }: { widget: WidgetInstance }) {
  const symbol = useWidgetSymbol(widget);

  // Layout & settings state
  const [range, setRange] = useState<Range>("6M");
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [active, setActive] = useState<Set<IndicatorType>>(new Set(["EMA", "VWAP"]));
  const [emaPeriod, setEmaPeriod] = useState<number>(20);
  const [smaPeriod, setSmaPeriod] = useState<number>(50);
  const [priceSource, setPriceSource] = useState<PriceSource>("close");

  // Drawings state
  const [currentTool, setCurrentTool] = useState<DrawingToolType>("cursor");
  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number; time: number; price: number } | null>(null);

  // Patterns, MTF, and Alerts state
  const [showPatterns, setShowPatterns] = useState(false);
  const [showMTF, setShowMTF] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [alerts, setAlerts] = useState<ChartAlert[]>([]);
  const [newAlertLevel, setNewAlertLevel] = useState<string>("");
  const [alertToast, setAlertToast] = useState<string | null>(null);

  // Layouts
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>("default");

  // Live streaming & chart refs
  const [legend, setLegend] = useState<Candle | null>(null);
  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<any> | null>(null);

  // Real-time market stream hook
  const { tick, status: streamStatus, latency } = useMarketStream(symbol);

  // Tick pulse / flash animation state for live 1-second price engagement
  const [lastTickPrice, setLastTickPrice] = useState<number | null>(null);
  const [tickFlash, setTickFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!tick?.price) return;
    if (lastTickPrice !== null) {
      if (tick.price > lastTickPrice) {
        setTickFlash("up");
      } else if (tick.price < lastTickPrice) {
        setTickFlash("down");
      }
      const t = setTimeout(() => setTickFlash(null), 600);
      return () => clearTimeout(t);
    }
    setLastTickPrice(tick.price);
  }, [tick?.price, tick?.timestamp]);

  // Load persistent drawings, layouts, and alerts on mount / symbol change
  useEffect(() => {
    setDrawings(loadDrawings(symbol));
    setLayouts(loadLayouts());
    setAlerts(loadAlerts());
  }, [symbol]);

  // Query historical candles
  const isForex = symbol.includes("/") || symbol.includes("=") || /^[A-Z]{6}$/.test(symbol);
  const { data: rawCandles, error, refetch } = useQuery({
    queryKey: ["history", symbol, range, timeframe],
    queryFn: () => apiGet<Candle[]>(`/api/history/${encodeURIComponent(symbol)}?range=${range}&interval=${timeframe}`),
    refetchInterval: range === "1D" ? 10_000 : 60_000,
  });

  // Maintain local mutable candles array for real-time tick integration
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    if (rawCandles && rawCandles.length > 0) {
      setCandles([...rawCandles]);
    }
  }, [rawCandles]);

function getTimeframeSeconds(tf: string): number {
  switch (tf) {
    case "1m": return 60;
    case "3m": return 180;
    case "5m": return 300;
    case "15m": return 900;
    case "30m": return 1800;
    case "45m": return 2700;
    case "1H": return 3600;
    case "2H": return 7200;
    case "4H": return 14400;
    case "1D": return 86400;
    case "1W": return 604800;
    case "1M": return 2592000;
    default: return 60;
  }
}

  // Real-time tick update: incremental candle update without full reload
  useEffect(() => {
    if (!tick || candles.length === 0) return;

    // Check alerts
    alerts.forEach((alert) => {
      if (!alert.triggered && alert.symbol.toUpperCase() === symbol.toUpperCase()) {
        if (alert.type === "price_above" && tick.price >= alert.targetValue) {
          alert.triggered = true;
          alert.triggeredAt = Date.now();
          saveAlerts([...alerts]);
          setAlertToast(`ALERT: ${symbol} traded above ${alert.targetValue}! (LTP: ${fmt(tick.price)})`);
          setTimeout(() => setAlertToast(null), 6000);
        } else if (alert.type === "price_below" && tick.price <= alert.targetValue) {
          alert.triggered = true;
          alert.triggeredAt = Date.now();
          saveAlerts([...alerts]);
          setAlertToast(`ALERT: ${symbol} traded below ${alert.targetValue}! (LTP: ${fmt(tick.price)})`);
          setTimeout(() => setAlertToast(null), 6000);
        }
      }
    });

    const tfSec = getTimeframeSeconds(timeframe);
    const tickSec = Math.floor((tick.timestamp || Date.now()) / 1000);
    const currentBucket = Math.floor(tickSec / tfSec) * tfSec;

    const lastIdx = candles.length - 1;
    const last = candles[lastIdx];

    // If tick is in same bar or within timeframe bucket
    if (last.time === currentBucket || Math.abs(tickSec - last.time) < tfSec) {
      const updated: Candle = {
        ...last,
        high: Math.max(last.high, tick.price),
        low: Math.min(last.low, tick.price),
        close: tick.price,
        volume: (tick.volume ?? last.volume) + 1,
      };

      setCandles((prev) => {
        const next = [...prev];
        next[lastIdx] = updated;
        return next;
      });

      // Incrementally update lightweight-charts series if available
      if (mainSeriesRef.current) {
        if (chartType === "candles" || chartType === "bars") {
          mainSeriesRef.current.update({
            time: ts(updated.time),
            open: updated.open,
            high: updated.high,
            low: updated.low,
            close: updated.close,
          });
        } else {
          mainSeriesRef.current.update({ time: ts(updated.time), value: updated.close });
        }
      }

      if (volSeriesRef.current) {
        volSeriesRef.current.update({
          time: ts(updated.time),
          value: updated.volume,
          color: updated.close >= updated.open ? "rgba(0,200,83,0.4)" : "rgba(255,61,61,0.4)",
        });
      }
    } else if (tickSec > last.time) {
      // Append a new bar for the new timeframe bucket
      const newBar: Candle = {
        time: currentBucket,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume ?? 1,
      };

      setCandles((prev) => [...prev, newBar]);

      if (mainSeriesRef.current) {
        if (chartType === "candles" || chartType === "bars") {
          mainSeriesRef.current.update({
            time: ts(newBar.time),
            open: newBar.open,
            high: newBar.high,
            low: newBar.low,
            close: newBar.close,
          });
        } else {
          mainSeriesRef.current.update({ time: ts(newBar.time), value: newBar.close });
        }
      }

      if (volSeriesRef.current) {
        volSeriesRef.current.update({
          time: ts(newBar.time),
          value: newBar.volume,
          color: "rgba(0,200,83,0.4)",
        });
      }
    }
  }, [tick]);

  // Display candles: Heikin Ashi if chosen, otherwise standard
  const activeCandles = useMemo(() => {
    return chartType === "heikin_ashi" ? computeHeikinAshi(candles) : candles;
  }, [candles, chartType]);

  // Fast time lookup for crosshair
  const byTime = useMemo(() => {
    const m = new Map<number, Candle>();
    for (const c of activeCandles) m.set(c.time, c);
    return m;
  }, [activeCandles]);

  // Computed indicators
  const indicatorData = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    return {
      SMA: active.has("SMA") ? sma(candles, smaPeriod, priceSource) : null,
      EMA: active.has("EMA") ? ema(candles, emaPeriod, priceSource) : null,
      WMA: active.has("WMA") ? wma(candles, 20, priceSource) : null,
      VWAP: active.has("VWAP") ? vwap(candles) : null,
      BOLL: active.has("BOLL") ? bollinger(candles, 20, 2, priceSource) : null,
      RSI: active.has("RSI") ? rsi(candles, 14, priceSource) : null,
      MACD: active.has("MACD") ? macd(candles, 12, 26, 9, priceSource) : null,
      ATR: active.has("ATR") ? atr(candles, 14) : null,
      STOCH: active.has("STOCH") ? stochastic(candles, 14, 3) : null,
      OBV: active.has("OBV") ? obv(candles) : null,
      VOL_MA: active.has("VOL_MA") ? volumeMa(candles, 20) : null,
    };
  }, [candles, active, smaPeriod, emaPeriod, priceSource]);

  const indicatorMaps = useMemo(() => {
    const maps: Record<string, Map<number, number>> = {};
    if (!indicatorData) return maps;
    if (indicatorData.SMA) maps.SMA = toMap(indicatorData.SMA);
    if (indicatorData.EMA) maps.EMA = toMap(indicatorData.EMA);
    if (indicatorData.WMA) maps.WMA = toMap(indicatorData.WMA);
    if (indicatorData.VWAP) maps.VWAP = toMap(indicatorData.VWAP);
    if (indicatorData.BOLL) {
      maps.BOLL_U = toMap(indicatorData.BOLL.upper);
      maps.BOLL_M = toMap(indicatorData.BOLL.middle);
      maps.BOLL_L = toMap(indicatorData.BOLL.lower);
    }
    if (indicatorData.RSI) maps.RSI = toMap(indicatorData.RSI);
    if (indicatorData.MACD) {
      maps.MACD_M = toMap(indicatorData.MACD.macd);
      maps.MACD_S = toMap(indicatorData.MACD.signal);
      maps.MACD_H = toMap(indicatorData.MACD.histogram);
    }
    if (indicatorData.ATR) maps.ATR = toMap(indicatorData.ATR);
    if (indicatorData.STOCH) {
      maps.STOCH_K = toMap(indicatorData.STOCH.k);
      maps.STOCH_D = toMap(indicatorData.STOCH.d);
    }
    if (indicatorData.OBV) maps.OBV = toMap(indicatorData.OBV);
    if (indicatorData.VOL_MA) maps.VOL_MA = toMap(indicatorData.VOL_MA);
    return maps;
  }, [indicatorData]);

  // Patterns & MTF
  const detectedPatterns = useMemo(() => {
    if (!showPatterns || candles.length < 5) return [];
    return [...detectCandlestickPatterns(candles), ...detectChartPatterns(candles)];
  }, [candles, showPatterns]);

  const mtfSummaries = useMemo(() => {
    if (!showMTF || candles.length < 20) return [];
    return computeMTF(candles);
  }, [candles, showMTF]);

  // Legend rows
  const indicatorRows = useMemo(() => {
    if (!legend) return [];
    const t = legend.time;
    const get = (key: string) => indicatorMaps[key]?.get(t);
    const rows: Array<{ label: string; value: string; color: string }> = [];

    if (active.has("SMA") && get("SMA") !== undefined)
      rows.push({ label: `SMA ${smaPeriod}`, value: fmt(get("SMA")), color: INDICATOR_COLOR.SMA });
    if (active.has("EMA") && get("EMA") !== undefined)
      rows.push({ label: `EMA ${emaPeriod}`, value: fmt(get("EMA")), color: INDICATOR_COLOR.EMA });
    if (active.has("WMA") && get("WMA") !== undefined)
      rows.push({ label: "WMA 20", value: fmt(get("WMA")), color: INDICATOR_COLOR.WMA });
    if (active.has("VWAP") && get("VWAP") !== undefined)
      rows.push({ label: "VWAP", value: fmt(get("VWAP")), color: INDICATOR_COLOR.VWAP });
    if (active.has("RSI") && get("RSI") !== undefined)
      rows.push({ label: "RSI 14", value: fmt(get("RSI"), 1), color: INDICATOR_COLOR.RSI });
    if (active.has("ATR") && get("ATR") !== undefined)
      rows.push({ label: "ATR 14", value: fmt(get("ATR"), 2), color: INDICATOR_COLOR.ATR });
    if (active.has("OBV") && get("OBV") !== undefined)
      rows.push({ label: "OBV", value: fmtBig(get("OBV")), color: INDICATOR_COLOR.OBV });

    if (active.has("BOLL") && get("BOLL_M") !== undefined) {
      rows.push({
        label: "BOLL",
        value: `${fmt(get("BOLL_U"))} / ${fmt(get("BOLL_M"))} / ${fmt(get("BOLL_L"))}`,
        color: INDICATOR_COLOR.BOLL,
      });
    }
    if (active.has("MACD") && get("MACD_M") !== undefined) {
      rows.push({
        label: "MACD",
        value: `${fmt(get("MACD_M"), 2)} / ${fmt(get("MACD_S"), 2)}`,
        color: INDICATOR_COLOR.MACD,
      });
    }
    if (active.has("STOCH") && get("STOCH_K") !== undefined) {
      rows.push({
        label: "STOCH",
        value: `%K ${fmt(get("STOCH_K"), 1)} / %D ${fmt(get("STOCH_D"), 1)}`,
        color: INDICATOR_COLOR.STOCH,
      });
    }

    return rows;
  }, [legend, indicatorMaps, active, smaPeriod, emaPeriod]);

  useEffect(() => {
    setLegend(activeCandles && activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null);
  }, [activeCandles]);

  // Chart setup
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !activeCandles || activeCandles.length === 0) return;

    const chart = createChart(el, {
      layout: { background: { color: "#0a0a0a" }, textColor: "#808080", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "#161616" }, horzLines: { color: "#161616" } },
      crosshair: { mode: 0 },
      timeScale: {
        borderColor: "#262626",
        timeVisible: range === "1D" || range === "5D" || timeframe === "1m" || timeframe === "5m",
      },
      rightPriceScale: { borderColor: "#262626" },
      autoSize: true,
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const upColor = "#00c853";
    const downColor = "#ff3d3d";

    let mainSeries: ISeriesApi<any>;

    if (chartType === "candles" || chartType === "heikin_ashi") {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
      });
      mainSeries.setData(
        activeCandles.map((c) => ({ time: ts(c.time), open: c.open, high: c.high, low: c.low, close: c.close }))
      );
    } else if (chartType === "bars") {
      mainSeries = chart.addSeries(BarSeries, { upColor, downColor });
      mainSeries.setData(
        activeCandles.map((c) => ({ time: ts(c.time), open: c.open, high: c.high, low: c.low, close: c.close }))
      );
    } else if (chartType === "line") {
      mainSeries = chart.addSeries(LineSeries, { color: "#ff9900", lineWidth: 1 });
      mainSeries.setData(activeCandles.map((c) => ({ time: ts(c.time), value: c.close })));
    } else if (chartType === "baseline") {
      const baseVal = activeCandles[0].close;
      mainSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: baseVal },
        topFillColor1: "rgba(0, 200, 83, 0.25)",
        topFillColor2: "rgba(0, 200, 83, 0.0)",
        topLineColor: "#00c853",
        bottomFillColor1: "rgba(255, 61, 61, 0.0)",
        bottomFillColor2: "rgba(255, 61, 61, 0.25)",
        bottomLineColor: "#ff3d3d",
      });
      mainSeries.setData(activeCandles.map((c) => ({ time: ts(c.time), value: c.close })));
    } else {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: "#ff9900",
        topColor: "rgba(255,153,0,0.25)",
        bottomColor: "rgba(255,153,0,0)",
      });
      mainSeries.setData(activeCandles.map((c) => ({ time: ts(c.time), value: c.close })));
    }
    mainSeriesRef.current = mainSeries;

    // Volume histogram
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(
      activeCandles.map((c) => ({
        time: ts(c.time),
        value: c.volume || (c as any).tickVolume || 0,
        color: c.close >= c.open ? "rgba(0,200,83,0.35)" : "rgba(255,61,61,0.35)",
      }))
    );
    volSeriesRef.current = vol;

    // Overlays
    const overlay = (points: Point[], color: string, width = 1) =>
      chart
        .addSeries(LineSeries, { color, lineWidth: width as any, priceLineVisible: false, lastValueVisible: false })
        .setData(points.map((p) => ({ time: ts(p.time), value: p.value })));

    if (indicatorData?.SMA) overlay(indicatorData.SMA, INDICATOR_COLOR.SMA);
    if (indicatorData?.EMA) overlay(indicatorData.EMA, INDICATOR_COLOR.EMA, 2);
    if (indicatorData?.WMA) overlay(indicatorData.WMA, INDICATOR_COLOR.WMA);
    if (indicatorData?.VWAP) overlay(indicatorData.VWAP, INDICATOR_COLOR.VWAP);
    if (indicatorData?.BOLL) {
      overlay(indicatorData.BOLL.upper, "rgba(255,153,0,0.4)");
      overlay(indicatorData.BOLL.middle, "rgba(255,153,0,0.8)");
      overlay(indicatorData.BOLL.lower, "rgba(255,153,0,0.4)");
    }

    // Separate Panes for Oscillators
    let paneIdx = 1;
    if (indicatorData?.RSI) {
      const s = chart.addSeries(LineSeries, { color: INDICATOR_COLOR.RSI, lineWidth: 1 }, paneIdx++);
      s.setData(indicatorData.RSI.map((p) => ({ time: ts(p.time), value: p.value })));
    }
    if (indicatorData?.MACD) {
      const m = indicatorData.MACD;
      const pane = paneIdx++;
      chart.addSeries(HistogramSeries, { color: "#4fc3f7" }, pane).setData(
        m.histogram.map((p) => ({
          time: ts(p.time),
          value: p.value,
          color: p.value >= 0 ? "rgba(0,200,83,0.6)" : "rgba(255,61,61,0.6)",
        }))
      );
      chart.addSeries(LineSeries, { color: "#ff9900", lineWidth: 1 }, pane).setData(
        m.macd.map((p) => ({ time: ts(p.time), value: p.value }))
      );
      chart.addSeries(LineSeries, { color: "#ffffff", lineWidth: 1 }, pane).setData(
        m.signal.map((p) => ({ time: ts(p.time), value: p.value }))
      );
    }
    if (indicatorData?.ATR) {
      const s = chart.addSeries(LineSeries, { color: INDICATOR_COLOR.ATR, lineWidth: 1 }, paneIdx++);
      s.setData(indicatorData.ATR.map((p) => ({ time: ts(p.time), value: p.value })));
    }
    if (indicatorData?.STOCH) {
      const pane = paneIdx++;
      chart.addSeries(LineSeries, { color: "#81c784", lineWidth: 1 }, pane).setData(
        indicatorData.STOCH.k.map((p) => ({ time: ts(p.time), value: p.value }))
      );
      chart.addSeries(LineSeries, { color: "#ff8a65", lineWidth: 1 }, pane).setData(
        indicatorData.STOCH.d.map((p) => ({ time: ts(p.time), value: p.value }))
      );
    }

    // Crosshair subscription
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time) {
        setLegend(activeCandles[activeCandles.length - 1]);
        return;
      }
      const hit = byTime.get(param.time as number);
      if (hit) setLegend(hit);
    });

    // Detect if user scrolled away from latest candle
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      const totalBars = activeCandles.length;
      if (range.to < totalBars - 5) {
        setIsScrolledAway(true);
      } else {
        setIsScrolledAway(false);
      }
    });

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, [activeCandles, chartType, indicatorData, range, timeframe, byTime]);

  // Go to Live Action
  const handleGoToLive = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
      setIsScrolledAway(false);
    }
  };

  // Drawing Handlers
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (currentTool === "cursor") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!chartRef.current || !mainSeriesRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const t = (timeScale as any).coordinateToTime?.(x) ?? activeCandles[activeCandles.length - 1]?.time ?? Date.now() / 1000;
    const p = (mainSeriesRef.current as any).coordinateToPrice?.(y) ?? activeCandles[activeCandles.length - 1]?.close ?? 0;

    setDrawingStart({ x, y, time: t as number, price: p });
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawingStart || currentTool === "cursor") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!chartRef.current || !mainSeriesRef.current) {
      setDrawingStart(null);
      return;
    }

    const timeScale = chartRef.current.timeScale();
    const t = (timeScale as any).coordinateToTime?.(x) ?? activeCandles[activeCandles.length - 1]?.time ?? Date.now() / 1000;
    const p = (mainSeriesRef.current as any).coordinateToPrice?.(y) ?? activeCandles[activeCandles.length - 1]?.close ?? 0;

    const newItem: DrawingItem = {
      id: `${currentTool}-${Date.now()}`,
      type: currentTool,
      p1: { time: drawingStart.time, price: drawingStart.price },
      p2: { time: t as number, price: p },
      color: "#ff9900",
      lineWidth: 2,
    };

    const next = [...drawings, newItem];
    setDrawings(next);
    saveDrawings(symbol, next);
    setDrawingStart(null);
    setCurrentTool("cursor");
  };

  const clearAllDrawings = () => {
    setDrawings([]);
    saveDrawings(symbol, []);
  };

  const undoDrawing = () => {
    if (drawings.length === 0) return;
    const next = drawings.slice(0, -1);
    setDrawings(next);
    saveDrawings(symbol, next);
  };

  const toggleIndicator = (ind: IndicatorType) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });

  // Layout save
  const handleSaveLayout = () => {
    const newL: SavedLayout = {
      id: `custom-${Date.now()}`,
      name: `Layout ${layouts.length + 1}`,
      symbol,
      range,
      timeframe,
      chartType,
      activeIndicators: Array.from(active),
      drawings,
      updatedAt: Date.now(),
    };
    const next = [...layouts, newL];
    setLayouts(next);
    saveLayouts(next);
    setSelectedLayoutId(newL.id);
  };

  const handleApplyLayout = (id: string) => {
    setSelectedLayoutId(id);
    const found = layouts.find((l) => l.id === id);
    if (!found) return;
    if (found.range) setRange(found.range as Range);
    if (found.timeframe) setTimeframe(found.timeframe as Timeframe);
    if (found.chartType) setChartType(found.chartType as ChartType);
    if (found.activeIndicators) setActive(new Set(found.activeIndicators as IndicatorType[]));
    if (found.drawings) {
      setDrawings(found.drawings);
      saveDrawings(symbol, found.drawings);
    }
  };

  // Add Alert
  const handleAddAlert = (type: "price_above" | "price_below") => {
    const val = parseFloat(newAlertLevel);
    if (isNaN(val)) return;
    const newAlert: ChartAlert = {
      id: `alert-${Date.now()}`,
      symbol,
      type,
      targetValue: val,
      message: `${symbol} ${type === "price_above" ? ">=" : "<="} ${val}`,
      createdAt: Date.now(),
      triggered: false,
    };
    const next = [...alerts, newAlert];
    setAlerts(next);
    saveAlerts(next);
    setNewAlertLevel("");
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-[#d9d9d9] select-none">
      {/* Toast alert popup */}
      {alertToast && (
        <div className="absolute top-2 right-4 z-50 bg-[#ff9900] text-black px-4 py-2 font-bold rounded shadow-lg border border-black animate-bounce">
          {alertToast}
        </div>
      )}

      {/* Top Header: Symbol, Live Latency, Data Status */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#111111] border-b border-[#262626] text-[11px] flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#ff9900] text-[12px]">{symbol}</span>
          {(() => {
            const lastBar = activeCandles && activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null;
            const displayPrice = legend?.close ?? tick?.price ?? lastBar?.close ?? null;
            const displayOpen = legend?.open ?? lastBar?.open ?? displayPrice;
            const priceChange = displayPrice !== null && displayOpen !== null ? displayPrice - displayOpen : 0;
            const priceChangePct = displayOpen && priceChange !== null && displayOpen > 0 ? (priceChange / displayOpen) * 100 : 0;

            if (displayPrice === null) return null;

            return (
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[13px] font-semibold transition-colors duration-200 px-1 py-0.5 rounded ${
                    tickFlash === "up"
                      ? "bg-[#00c853]/30 text-[#00e676]"
                      : tickFlash === "down"
                      ? "bg-[#ff3d3d]/30 text-[#ff5252]"
                      : "text-white"
                  }`}
                >
                  {fmt(displayPrice)}
                </span>
                <span className={`text-[11px] font-medium ${priceChange >= 0 ? "text-[#00c853]" : "text-[#ff3d3d]"}`}>
                  {priceChange >= 0 ? "+" : ""}{fmt(priceChange)} ({priceChangePct.toFixed(2)}%)
                </span>
              </div>
            );
          })()}

          {/* Status Badge */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider ${
              streamStatus === "LIVE"
                ? "bg-[#00c853]/20 text-[#00c853] border border-[#00c853]/40"
                : streamStatus === "CLOSED"
                ? "bg-[#ff9900]/20 text-[#ff9900] border border-[#ff9900]/40"
                : streamStatus === "STALE"
                ? "bg-[#ff9900]/20 text-[#ff9900] border border-[#ff9900]/40"
                : "bg-[#ff3d3d]/20 text-[#ff3d3d] border border-[#ff3d3d]/40"
            }`}
          >
            ● {streamStatus === "CLOSED" ? "MARKET CLOSED (WEEKEND)" : streamStatus}
          </span>
        </div>

        {/* Real Empirical Latency Monitor */}
        <div className="flex items-center gap-2 text-[10px] text-[#808080]">
          <span>Source: <strong className="text-[#d9d9d9]">{latency.source}</strong></span>
          {latency.feedLatencyMs !== null && (
            <span>Feed: <strong className="text-[#00c853]">{latency.feedLatencyMs}ms</strong></span>
          )}
          {latency.backendLatencyMs !== null && (
            <span>Backend: <strong className="text-[#4fc3f7]">{latency.backendLatencyMs}ms</strong></span>
          )}
          {latency.frontendLatencyMs !== null && (
            <span>Frontend: <strong className="text-[#ffd966]">{latency.frontendLatencyMs}ms</strong></span>
          )}
          {latency.totalLatencyMs !== null && (
            <span className="border-l border-[#333] pl-1.5">
              Total: <strong className="text-[#ff9900]">{latency.totalLatencyMs}ms</strong>
            </span>
          )}
        </div>
      </div>

      {/* Toolbar 1: Timeframes, Ranges, Chart Types */}
      <div className="flex items-center gap-1 p-1 bg-[#0d0d0d] border-b border-[#1f1f1f] flex-wrap text-[11px]">
        {/* Timeframe selector */}
        <div className="flex gap-0.5 bg-[#141414] p-0.5 rounded border border-[#262626]">
          {TIMEFRAMES.slice(0, 7).map((tf) => (
            <button
              key={tf}
              className={`px-1.5 py-0.5 text-[10px] rounded ${timeframe === tf ? "bg-[#ff9900] text-black font-bold" : "text-[#808080] hover:text-white"}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
          <select
            className="bg-transparent text-[10px] text-[#808080] cursor-pointer outline-none"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf} className="bg-[#111] text-white">
                {tf}
              </option>
            ))}
          </select>
        </div>

        <span className="w-1 border-r border-[#262626] h-4" />

        {/* Ranges */}
        {RANGES.map((r) => (
          <button
            key={r}
            className={`term-btn !px-1.5 !py-0.5 !text-[10px] ${range === r ? "active" : ""}`}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}

        <span className="w-1 border-r border-[#262626] h-4" />

        {/* Chart Types */}
        {CHART_TYPES.map((t) => (
          <button
            key={t}
            className={`term-btn !px-1.5 !py-0.5 !text-[10px] ${chartType === t ? "active" : ""}`}
            onClick={() => setChartType(t)}
          >
            {t.replace("_", " ").toUpperCase()}
          </button>
        ))}

        {/* Go to Live Button */}
        {isScrolledAway && (
          <button
            className="ml-auto term-btn active !bg-[#ff9900] !text-black !font-bold animate-pulse text-[10px]"
            onClick={handleGoToLive}
          >
            ▶ GO TO LIVE
          </button>
        )}
      </div>

      {/* Toolbar 2: Indicators, Drawings, Patterns, Layouts */}
      <div className="flex items-center gap-1 p-1 bg-[#0d0d0d] border-b border-[#1f1f1f] flex-wrap text-[11px]">
        {/* Indicators toggle */}
        {INDICATOR_LIST.map((ind) => (
          <button
            key={ind}
            className={`term-btn !px-1.5 !py-0.5 !text-[10px] ${active.has(ind) ? "active" : ""}`}
            onClick={() => toggleIndicator(ind)}
          >
            {ind}
          </button>
        ))}

        <span className="w-1 border-r border-[#262626] h-4" />

        {/* Patterns & MTF */}
        <button
          className={`term-btn !px-2 !py-0.5 !text-[10px] ${showPatterns ? "active font-bold" : ""}`}
          onClick={() => setShowPatterns(!showPatterns)}
        >
          PATTERNS {detectedPatterns.length > 0 && `(${detectedPatterns.length})`}
        </button>

        <button
          className={`term-btn !px-2 !py-0.5 !text-[10px] ${showMTF ? "active font-bold" : ""}`}
          onClick={() => setShowMTF(!showMTF)}
        >
          MTF TREND
        </button>

        <button
          className={`term-btn !px-2 !py-0.5 !text-[10px] ${showAlertsModal ? "active" : ""}`}
          onClick={() => setShowAlertsModal(!showAlertsModal)}
        >
          ALERTS {alerts.length > 0 && `(${alerts.length})`}
        </button>

        <span className="w-1 border-r border-[#262626] h-4" />

        {/* Saved Layouts */}
        <select
          className="term-btn !px-1 !py-0.5 !text-[10px]"
          value={selectedLayoutId}
          onChange={(e) => handleApplyLayout(e.target.value)}
        >
          <option value="default">Layout: Default</option>
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              Layout: {l.name}
            </option>
          ))}
        </select>
        <button className="term-btn !px-1.5 !py-0.5 !text-[10px]" onClick={handleSaveLayout}>
          SAVE
        </button>
      </div>

      {/* Toolbar 3: Drawing Tools Strip */}
      <div className="flex items-center gap-1 px-2 py-0.5 bg-[#111111] border-b border-[#222] text-[10px] text-[#808080]">
        <span className="font-semibold text-[#ff9900]">DRAW:</span>
        {(["cursor", "horizontal", "vertical", "trendline", "ray", "rectangle", "fibonacci", "measure"] as DrawingToolType[]).map((tool) => (
          <button
            key={tool}
            className={`px-1.5 py-0.5 rounded ${currentTool === tool ? "bg-[#ff9900] text-black font-bold" : "hover:text-white"}`}
            onClick={() => setCurrentTool(tool)}
          >
            {tool.toUpperCase()}
          </button>
        ))}
        <span className="w-1 border-r border-[#333] h-3 ml-2" />
        <button className="px-1.5 py-0.5 hover:text-white" onClick={undoDrawing}>
          UNDO
        </button>
        <button className="px-1.5 py-0.5 hover:text-red-400" onClick={clearAllDrawings}>
          CLEAR
        </button>
      </div>

      {/* Weekend / Market Closed Informational Notice */}
      {streamStatus === "CLOSED" && (
        <div className="bg-[#1c1602] border-b border-[#5c4000] px-3 py-1 text-[10px] text-[#ffcc00] flex items-center justify-between flex-wrap gap-2">
          <span>
            ℹ️ {tick?.marketNote ?? "This market is closed for the weekend (Forex & Equities reopen Sunday evening / Monday). Quotes remain frozen at the Friday market close."}
          </span>
          <span className="font-semibold text-white">
            For 24/7 sub-second live streaming right now, switch to <strong>BTCUSDT</strong> or <strong>ETHUSDT</strong>.
          </span>
        </div>
      )}

      {/* MTF summary row if active */}
      {showMTF && mtfSummaries.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1 bg-[#141414] border-b border-[#262626] text-[11px]">
          <span className="text-[#808080] font-semibold">MULTI-TIMEFRAME ANALYSIS:</span>
          {mtfSummaries.map((mtf) => (
            <span key={mtf.timeframe} className="flex items-center gap-1">
              <strong className="text-[#d9d9d9]">{mtf.timeframe}:</strong>
              <span style={{ color: mtf.color }} className="font-bold">
                {mtf.trend}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Patterns panel if active */}
      {showPatterns && (
        <div className="flex gap-2 px-3 py-1.5 bg-[#141414] border-b border-[#262626] text-[11px] overflow-x-auto">
          <span className="text-[#808080] font-semibold shrink-0">DETECTED PATTERNS:</span>
          {detectedPatterns.length === 0 ? (
            <span className="text-[#666]">No patterns detected in current range</span>
          ) : (
            detectedPatterns.map((pat) => (
              <span
                key={pat.id}
                className="px-2 py-0.5 rounded border border-[#333] bg-[#1a1a1a] flex items-center gap-1 shrink-0"
              >
                <strong className={pat.direction === "bullish" ? "up" : pat.direction === "bearish" ? "down" : "amber"}>
                  {pat.name}
                </strong>
                <span className="text-[9px] px-1 bg-black/40 rounded text-[#808080]">{pat.status}</span>
              </span>
            ))
          )}
        </div>
      )}

      {/* Alerts Modal Drawer */}
      {showAlertsModal && (
        <div className="p-3 bg-[#111111] border-b border-[#333] text-[11px] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#ff9900]">LOCAL PRICE & TECHNICAL ALERTS ({symbol})</span>
            <button className="text-[#808080] hover:text-white" onClick={() => setShowAlertsModal(false)}>
              ✕ CLOSE
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Price level (e.g. 24000 or 150.5)"
              value={newAlertLevel}
              onChange={(e) => setNewAlertLevel(e.target.value)}
              className="w-48 bg-[#1a1a1a] border border-[#333] px-2 py-1 text-white"
            />
            <button className="term-btn active" onClick={() => handleAddAlert("price_above")}>
              + ALERT ABOVE
            </button>
            <button className="term-btn active" onClick={() => handleAddAlert("price_below")}>
              + ALERT BELOW
            </button>
          </div>
          {alerts.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 max-h-32 overflow-y-auto">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-[#161616] px-2 py-1 rounded">
                  <span>{a.message}</span>
                  <span className={a.triggered ? "down" : "up"}>{a.triggered ? "TRIGGERED" : "ACTIVE"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart Canvas & SVG Overlay */}
      <div className="relative flex-1 min-h-0 w-full">
        {/* Dynamic Legend / Crosshair Info */}
        {legend && (
          <div className="absolute top-2 left-2 z-20 flex flex-col gap-0.5 text-[11px] pointer-events-none bg-[rgba(10,10,10,0.85)] px-2 py-1 rounded border border-[#222] max-w-[95%]">
            <div className="flex gap-3">
              <span className="dim">O <span className="text-[var(--text)]">{fmt(legend.open)}</span></span>
              <span className="dim">H <span className="up">{fmt(legend.high)}</span></span>
              <span className="dim">L <span className="down">{fmt(legend.low)}</span></span>
              <span className="dim">C <span className={legend.close >= legend.open ? "up" : "down"}>{fmt(legend.close)}</span></span>
              <span className="dim">
                {isForex ? "Tick Vol" : "Vol"}{" "}
                <span className="text-[var(--text)]">{fmtBig(legend.volume || (legend as any).tickVolume || 0)}</span>
              </span>
            </div>
            {indicatorRows.length > 0 && (
              <div className="flex gap-3 flex-wrap mt-0.5">
                {indicatorRows.map((r) => (
                  <span key={r.label} className="dim">
                    {r.label} <span style={{ color: r.color }}>{r.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lightweight Charts Main Container */}
        <div ref={containerRef} className="w-full h-full" />

        {/* SVG Overlay for Drawing Tools & Fibonacci */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-auto"
          style={{ cursor: currentTool === "cursor" ? "default" : "crosshair" }}
          onMouseDown={handleSvgMouseDown}
          onMouseUp={handleSvgMouseUp}
        >
          {drawings.map((d) => {
            if (!chartRef.current || !mainSeriesRef.current) return null;
            const timeScale = chartRef.current.timeScale();
            const x1 = (timeScale as any).timeToCoordinate?.(d.p1.time) ?? 0;
            const y1 = (mainSeriesRef.current as any).priceToCoordinate?.(d.p1.price) ?? 0;
            const x2 = d.p2 ? (timeScale as any).timeToCoordinate?.(d.p2.time) ?? x1 : x1;
            const y2 = d.p2 ? (mainSeriesRef.current as any).priceToCoordinate?.(d.p2.price) ?? y1 : y1;

            if (d.type === "horizontal") {
              return (
                <line
                  key={d.id}
                  x1={0}
                  y1={y1}
                  x2="100%"
                  y2={y1}
                  stroke={d.color || "#ff9900"}
                  strokeWidth={d.lineWidth || 2}
                  strokeDasharray="4 2"
                />
              );
            }
            if (d.type === "vertical") {
              return (
                <line
                  key={d.id}
                  x1={x1}
                  y1={0}
                  x2={x1}
                  y2="100%"
                  stroke={d.color || "#ff9900"}
                  strokeWidth={d.lineWidth || 2}
                  strokeDasharray="4 2"
                />
              );
            }
            if (d.type === "trendline" || d.type === "ray") {
              return (
                <line
                  key={d.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={d.color || "#ff9900"}
                  strokeWidth={d.lineWidth || 2}
                />
              );
            }
            if (d.type === "rectangle") {
              return (
                <rect
                  key={d.id}
                  x={Math.min(x1, x2)}
                  y={Math.min(y1, y2)}
                  width={Math.abs(x2 - x1)}
                  height={Math.abs(y2 - y1)}
                  fill="rgba(255, 153, 0, 0.15)"
                  stroke={d.color || "#ff9900"}
                  strokeWidth={d.lineWidth || 1}
                />
              );
            }
            if (d.type === "fibonacci" && d.p2) {
              const highPrice = Math.max(d.p1.price, d.p2.price);
              const lowPrice = Math.min(d.p1.price, d.p2.price);
              const diff = highPrice - lowPrice;

              return (
                <g key={d.id}>
                  {FIBONACCI_LEVELS.map((lvl) => {
                    const priceLvl = highPrice - diff * lvl;
                    const yLvl = (mainSeriesRef.current as any).priceToCoordinate?.(priceLvl) ?? 0;
                    return (
                      <g key={lvl}>
                        <line x1={0} y1={yLvl} x2="100%" y2={yLvl} stroke="#4fc3f7" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={10} y={yLvl - 3} fill="#4fc3f7" fontSize={9}>
                          Fib {(lvl * 100).toFixed(1)}% ({priceLvl.toFixed(2)})
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
}
