export type DrawingToolType =
  | "cursor"
  | "horizontal"
  | "vertical"
  | "trendline"
  | "ray"
  | "rectangle"
  | "fibonacci"
  | "measure";

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface DrawingItem {
  id: string;
  type: DrawingToolType;
  p1: DrawingPoint;
  p2?: DrawingPoint;
  color?: string;
  lineWidth?: number;
  text?: string;
}

export interface ChartAlert {
  id: string;
  symbol: string;
  type: "price_above" | "price_below" | "rsi_overbought" | "rsi_oversold" | "pattern";
  targetValue: number;
  message: string;
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
}

export interface SavedLayout {
  id: string;
  name: string;
  symbol: string;
  range: string;
  timeframe: string;
  chartType: string;
  activeIndicators: string[];
  drawings: DrawingItem[];
  updatedAt: number;
}

const DRAWINGS_KEY_PREFIX = "ot_drawings_";
const LAYOUTS_KEY = "ot_chart_layouts_v1";
const ALERTS_KEY = "ot_chart_alerts_v1";

export function loadDrawings(symbol: string): DrawingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${DRAWINGS_KEY_PREFIX}${symbol.toUpperCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, items: DrawingItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${DRAWINGS_KEY_PREFIX}${symbol.toUpperCase()}`, JSON.stringify(items));
  } catch {}
}

export function loadLayouts(): SavedLayout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY);
    if (!raw) {
      // Default presets
      return [
        {
          id: "intraday",
          name: "Intraday 5m",
          symbol: "NIFTY",
          range: "1D",
          timeframe: "5m",
          chartType: "candles",
          activeIndicators: ["EMA20", "VWAP", "RSI"],
          drawings: [],
          updatedAt: Date.now(),
        },
        {
          id: "swing",
          name: "Swing Daily",
          symbol: "RELIANCE",
          range: "6M",
          timeframe: "1D",
          chartType: "candles",
          activeIndicators: ["SMA50", "SMA200", "MACD"],
          drawings: [],
          updatedAt: Date.now(),
        },
        {
          id: "forex",
          name: "Forex Majors",
          symbol: "EUR/USD",
          range: "1M",
          timeframe: "1H",
          chartType: "candles",
          activeIndicators: ["EMA20", "BOLL", "RSI"],
          drawings: [],
          updatedAt: Date.now(),
        },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLayouts(layouts: SavedLayout[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
  } catch {}
}

export function loadAlerts(): ChartAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: ChartAlert[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch {}
}

export const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.618];
