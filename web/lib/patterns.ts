import type { Candle } from "./api";

export interface DetectedPattern {
  id: string;
  name: string;
  category: "reversal" | "continuation" | "candlestick";
  direction: "bullish" | "bearish" | "neutral";
  status: "Forming" | "Possible" | "Confirmed" | "Invalidated";
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  priceLevel?: number;
  description: string;
}

export function detectCandlestickPatterns(candles: Candle[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const n = candles.length;
  if (n < 3) return patterns;

  // Scan the last 30 candles for relevant candlestick setups
  const start = Math.max(0, n - 30);

  for (let i = start; i < n; i++) {
    const c = candles[i];
    const prev = i > 0 ? candles[i - 1] : null;
    const prev2 = i > 1 ? candles[i - 2] : null;

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range <= 0) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    // 1. Doji (Body < 10% of total range)
    if (body / range < 0.1) {
      patterns.push({
        id: `doji-${c.time}`,
        name: "Doji",
        category: "candlestick",
        direction: "neutral",
        status: i === n - 1 ? "Forming" : "Confirmed",
        startIndex: i,
        endIndex: i,
        startTime: c.time,
        endTime: c.time,
        priceLevel: c.close,
        description: "Indecision candle with minimal real body.",
      });
    }

    // 2. Hammer / Inverted Hammer
    if (lowerWick >= body * 2 && upperWick <= body * 0.5) {
      patterns.push({
        id: `hammer-${c.time}`,
        name: "Hammer",
        category: "candlestick",
        direction: "bullish",
        status: i === n - 1 ? "Forming" : "Confirmed",
        startIndex: i,
        endIndex: i,
        startTime: c.time,
        endTime: c.time,
        priceLevel: c.low,
        description: "Bullish rejection with long lower wick.",
      });
    } else if (upperWick >= body * 2 && lowerWick <= body * 0.5) {
      patterns.push({
        id: `shooting-star-${c.time}`,
        name: "Shooting Star / Inverted Hammer",
        category: "candlestick",
        direction: "bearish",
        status: i === n - 1 ? "Forming" : "Confirmed",
        startIndex: i,
        endIndex: i,
        startTime: c.time,
        endTime: c.time,
        priceLevel: c.high,
        description: "Bearish rejection with long upper wick.",
      });
    }

    // 3. Engulfing
    if (prev) {
      const prevBody = Math.abs(prev.close - prev.open);
      const isPrevBearish = prev.close < prev.open;
      const isCurBullish = c.close > c.open;

      if (isPrevBearish && isCurBullish && c.open <= prev.close && c.close >= prev.open && body > prevBody) {
        patterns.push({
          id: `bull-engulfing-${c.time}`,
          name: "Bullish Engulfing",
          category: "candlestick",
          direction: "bullish",
          status: i === n - 1 ? "Forming" : "Confirmed",
          startIndex: i - 1,
          endIndex: i,
          startTime: prev.time,
          endTime: c.time,
          priceLevel: c.close,
          description: "Large green candle engulfs prior red candle.",
        });
      } else if (!isPrevBearish && !isCurBullish && c.open >= prev.close && c.close <= prev.open && body > prevBody) {
        patterns.push({
          id: `bear-engulfing-${c.time}`,
          name: "Bearish Engulfing",
          category: "candlestick",
          direction: "bearish",
          status: i === n - 1 ? "Forming" : "Confirmed",
          startIndex: i - 1,
          endIndex: i,
          startTime: prev.time,
          endTime: c.time,
          priceLevel: c.close,
          description: "Large red candle engulfs prior green candle.",
        });
      }
    }

    // 4. Morning Star / Evening Star (3-candle)
    if (prev && prev2) {
      const p2Body = Math.abs(prev2.close - prev2.open);
      const p1Body = Math.abs(prev.close - prev.open);
      // Morning Star: Long Bearish -> Small Body -> Long Bullish
      if (prev2.close < prev2.open && p1Body < p2Body * 0.5 && c.close > c.open && c.close >= (prev2.open + prev2.close) / 2) {
        patterns.push({
          id: `morning-star-${c.time}`,
          name: "Morning Star",
          category: "candlestick",
          direction: "bullish",
          status: "Confirmed",
          startIndex: i - 2,
          endIndex: i,
          startTime: prev2.time,
          endTime: c.time,
          priceLevel: prev.low,
          description: "3-candle bullish reversal formation.",
        });
      }
      // Evening Star: Long Bullish -> Small Body -> Long Bearish
      if (prev2.close > prev2.open && p1Body < p2Body * 0.5 && c.close < c.open && c.close <= (prev2.open + prev2.close) / 2) {
        patterns.push({
          id: `evening-star-${c.time}`,
          name: "Evening Star",
          category: "candlestick",
          direction: "bearish",
          status: "Confirmed",
          startIndex: i - 2,
          endIndex: i,
          startTime: prev2.time,
          endTime: c.time,
          priceLevel: prev.high,
          description: "3-candle bearish reversal formation.",
        });
      }
    }
  }

  return patterns;
}

export function detectChartPatterns(candles: Candle[], sensitivity = 0.02): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const n = candles.length;
  if (n < 30) return patterns;

  // Identify local swing highs and swing lows (lookback 5)
  const swingHighs: Array<{ index: number; time: number; price: number }> = [];
  const swingLows: Array<{ index: number; time: number; price: number }> = [];

  for (let i = 5; i < n - 5; i++) {
    const curH = candles[i].high;
    const curL = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - 5; j <= i + 5; j++) {
      if (j === i) continue;
      if (candles[j].high > curH) isHigh = false;
      if (candles[j].low < curL) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, time: candles[i].time, price: curH });
    if (isLow) swingLows.push({ index: i, time: candles[i].time, price: curL });
  }

  // 1. Double Top
  if (swingHighs.length >= 2) {
    const h1 = swingHighs[swingHighs.length - 2];
    const h2 = swingHighs[swingHighs.length - 1];
    const diff = Math.abs(h1.price - h2.price) / h1.price;
    if (diff <= sensitivity && h2.index - h1.index >= 5 && h2.index - h1.index <= 60) {
      const currentPrice = candles[n - 1].close;
      const status = currentPrice < h2.price * 0.98 ? "Confirmed" : "Possible";
      patterns.push({
        id: `double-top-${h2.time}`,
        name: "Double Top",
        category: "reversal",
        direction: "bearish",
        status,
        startIndex: h1.index,
        endIndex: h2.index,
        startTime: h1.time,
        endTime: h2.time,
        priceLevel: (h1.price + h2.price) / 2,
        description: `Twin resistance peaks near ${((h1.price + h2.price) / 2).toFixed(2)}.`,
      });
    }
  }

  // 2. Double Bottom
  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2];
    const l2 = swingLows[swingLows.length - 1];
    const diff = Math.abs(l1.price - l2.price) / l1.price;
    if (diff <= sensitivity && l2.index - l1.index >= 5 && l2.index - l1.index <= 60) {
      const currentPrice = candles[n - 1].close;
      const status = currentPrice > l2.price * 1.02 ? "Confirmed" : "Possible";
      patterns.push({
        id: `double-bottom-${l2.time}`,
        name: "Double Bottom",
        category: "reversal",
        direction: "bullish",
        status,
        startIndex: l1.index,
        endIndex: l2.index,
        startTime: l1.time,
        endTime: l2.time,
        priceLevel: (l1.price + l2.price) / 2,
        description: `Twin support troughs near ${((l1.price + l2.price) / 2).toFixed(2)}.`,
      });
    }
  }

  // 3. Head and Shoulders (3 swing highs: left shoulder, head, right shoulder)
  if (swingHighs.length >= 3) {
    const left = swingHighs[swingHighs.length - 3];
    const head = swingHighs[swingHighs.length - 2];
    const right = swingHighs[swingHighs.length - 1];
    if (head.price > left.price && head.price > right.price) {
      const shoulderDiff = Math.abs(left.price - right.price) / left.price;
      if (shoulderDiff <= 0.05) {
        patterns.push({
          id: `head-shoulders-${right.time}`,
          name: "Head & Shoulders",
          category: "reversal",
          direction: "bearish",
          status: "Possible",
          startIndex: left.index,
          endIndex: right.index,
          startTime: left.time,
          endTime: right.time,
          priceLevel: head.price,
          description: `Head at ${head.price.toFixed(2)}, shoulders near ${left.price.toFixed(2)}.`,
        });
      }
    }
  }

  // 4. Bull Flag / Consolidation
  const recent20 = candles.slice(-20);
  if (recent20.length === 20) {
    const move = (recent20[10].close - recent20[0].close) / recent20[0].close;
    const consolidationRange = (Math.max(...recent20.slice(10).map((c) => c.high)) - Math.min(...recent20.slice(10).map((c) => c.low))) / recent20[10].close;
    if (move > 0.04 && consolidationRange < 0.02) {
      patterns.push({
        id: `bull-flag-${recent20[19].time}`,
        name: "Bull Flag",
        category: "continuation",
        direction: "bullish",
        status: "Forming",
        startIndex: n - 20,
        endIndex: n - 1,
        startTime: recent20[0].time,
        endTime: recent20[19].time,
        priceLevel: recent20[19].close,
        description: "Impulsive rally followed by tight consolidation flag.",
      });
    }
  }

  return patterns;
}

// -------------------------------------------------------------
// Multi-Timeframe Analysis (MTF)
// Returns trend sentiment across timeframes
// -------------------------------------------------------------

export interface MTFSummary {
  timeframe: string;
  trend: "Bullish" | "Bearish" | "Neutral";
  score: number; // -100 to +100
  color: string;
  keyLevel?: number;
}

export function computeMTF(candles: Candle[]): MTFSummary[] {
  if (candles.length < 20) {
    return [
      { timeframe: "5m", trend: "Neutral", score: 0, color: "#ffd966" },
      { timeframe: "15m", trend: "Neutral", score: 0, color: "#ffd966" },
      { timeframe: "1H", trend: "Neutral", score: 0, color: "#ffd966" },
      { timeframe: "4H", trend: "Neutral", score: 0, color: "#ffd966" },
      { timeframe: "1D", trend: "Neutral", score: 0, color: "#ffd966" },
    ];
  }

  const latest = candles[candles.length - 1];
  const c = latest.close;

  // Simple multi-period momentum analysis over slices
  const evaluate = (tf: string, lookback: number): MTFSummary => {
    const slice = candles.slice(-Math.min(lookback, candles.length));
    const startPrice = slice[0].close;
    const change = (c - startPrice) / startPrice;
    const score = Math.max(-100, Math.min(100, Math.round(change * 1000)));

    let trend: "Bullish" | "Bearish" | "Neutral" = "Neutral";
    let color = "#ffd966";
    if (score > 15) {
      trend = "Bullish";
      color = "#00c853";
    } else if (score < -15) {
      trend = "Bearish";
      color = "#ff3d3d";
    }

    return {
      timeframe: tf,
      trend,
      score,
      color,
      keyLevel: slice[slice.length - 1].close,
    };
  };

  return [
    evaluate("5m", 5),
    evaluate("15m", 15),
    evaluate("1H", 30),
    evaluate("4H", 60),
    evaluate("1D", 120),
  ];
}
