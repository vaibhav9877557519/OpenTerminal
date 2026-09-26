import type { Candle } from "./api";

export type Point = { time: number; value: number };
export type PriceSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";

export function getPrice(c: Candle, source: PriceSource = "close"): number {
  switch (source) {
    case "open": return c.open;
    case "high": return c.high;
    case "low": return c.low;
    case "hl2": return (c.high + c.low) / 2;
    case "hlc3": return (c.high + c.low + c.close) / 3;
    case "ohlc4": return (c.open + c.high + c.low + c.close) / 4;
    case "close":
    default:
      return c.close;
  }
}

export function sma(candles: Candle[], period: number, source: PriceSource = "close"): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const val = getPrice(candles[i], source);
    sum += val;
    if (i >= period) sum -= getPrice(candles[i - period], source);
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export function ema(candles: Candle[], period: number, source: PriceSource = "close"): Point[] {
  const out: Point[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (const c of candles) {
    const val = getPrice(c, source);
    prev = prev === null ? val : val * k + prev * (1 - k);
    out.push({ time: c.time, value: prev });
  }
  return out.slice(period - 1);
}

export function wma(candles: Candle[], period: number, source: PriceSource = "close"): Point[] {
  const out: Point[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < candles.length; i++) {
    let num = 0;
    for (let j = 0; j < period; j++) {
      const val = getPrice(candles[i - period + 1 + j], source);
      num += val * (j + 1);
    }
    out.push({ time: candles[i].time, value: num / denom });
  }
  return out;
}

export function vwap(candles: Candle[]): Point[] {
  const out: Point[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    if (cumV > 0) out.push({ time: c.time, value: cumPV / cumV });
  }
  return out;
}

export function rsi(candles: Candle[], period = 14, source: PriceSource = "close"): Point[] {
  const out: Point[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < candles.length; i++) {
    const cur = getPrice(candles[i], source);
    const prev = getPrice(candles[i - 1], source);
    const diff = cur - prev;
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
    }
  }
  return out;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9, source: PriceSource = "close"): {
  macd: Point[];
  signal: Point[];
  histogram: Point[];
} {
  const emaAll = (period: number): number[] => {
    const k = 2 / (period + 1);
    const vals: number[] = [];
    let prev: number | null = null;
    for (const c of candles) {
      const val = getPrice(c, source);
      prev = prev === null ? val : val * k + prev * (1 - k);
      vals.push(prev);
    }
    return vals;
  };
  const fastE = emaAll(fast);
  const slowE = emaAll(slow);
  const macdLine: Point[] = candles.map((c, i) => ({ time: c.time, value: fastE[i] - slowE[i] })).slice(slow - 1);
  const k = 2 / (signal + 1);
  let prev: number | null = null;
  const signalLine: Point[] = macdLine.map((p) => {
    prev = prev === null ? p.value : p.value * k + prev * (1 - k);
    return { time: p.time, value: prev };
  });
  const histogram = macdLine.map((p, i) => ({ time: p.time, value: p.value - signalLine[i].value }));
  return { macd: macdLine, signal: signalLine, histogram };
}

export function bollinger(candles: Candle[], period = 20, mult = 2, source: PriceSource = "close"): {
  upper: Point[];
  middle: Point[];
  lower: Point[];
} {
  const middle = sma(candles, period, source);
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = middle[i - period + 1].value;
    const variance = slice.reduce((acc, c) => acc + (getPrice(c, source) - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push({ time: candles[i].time, value: mean + mult * sd });
    lower.push({ time: candles[i].time, value: mean - mult * sd });
  }
  return { upper, middle, lower };
}

export function atr(candles: Candle[], period = 14): Point[] {
  const out: Point[] = [];
  if (candles.length < 2) return out;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  let prevAtr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push({ time: candles[period].time, value: prevAtr });
  for (let i = period; i < trs.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trs[i]) / period;
    out.push({ time: candles[i + 1].time, value: prevAtr });
  }
  return out;
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: Point[]; d: Point[] } {
  const kOut: Point[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (const c of slice) {
      if (c.high > highestHigh) highestHigh = c.high;
      if (c.low < lowestLow) lowestLow = c.low;
    }
    const currentClose = candles[i].close;
    const kVal = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kOut.push({ time: candles[i].time, value: kVal });
  }
  const dOut: Point[] = [];
  for (let i = dPeriod - 1; i < kOut.length; i++) {
    const sum = kOut.slice(i - dPeriod + 1, i + 1).reduce((acc, p) => acc + p.value, 0);
    dOut.push({ time: kOut[i].time, value: sum / dPeriod });
  }
  return { k: kOut, d: dOut };
}

export function obv(candles: Candle[]): Point[] {
  const out: Point[] = [];
  if (candles.length === 0) return out;
  let currentOBV = 0;
  out.push({ time: candles[0].time, value: currentOBV });
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const vol = c.volume || (c as any).tickVolume || 0;
    if (c.close > prev.close) {
      currentOBV += vol;
    } else if (c.close < prev.close) {
      currentOBV -= vol;
    }
    out.push({ time: c.time, value: currentOBV });
  }
  return out;
}

export function volumeMa(candles: Candle[], period = 20): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const v = candles[i].volume || (candles[i] as any).tickVolume || 0;
    sum += v;
    if (i >= period) sum -= (candles[i - period].volume || (candles[i - period] as any).tickVolume || 0);
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}
