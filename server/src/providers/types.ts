export type AssetType = "stock" | "index" | "forex" | "crypto" | "future" | "option";

export type DataQualityStatus = "LIVE" | "DELAYED" | "INDICATIVE" | "STALE" | "OFFLINE" | "UNAVAILABLE";

export interface NormalizedQuote {
  symbol: string;
  name: string;
  assetType: AssetType;
  price: number;
  bid: number | null;
  ask: number | null;
  mid?: number | null;
  spread?: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  tickVolume?: number | null;
  openInterest?: number | null;
  lastTradeQuantity?: number | null;
  marketCap?: number | null;
  pe?: number | null;
  eps?: number | null;
  dividendYield?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  beta?: number | null;
  sharesOutstanding?: number | null;
  timestamp: number;
  source: string;
  status: DataQualityStatus;
  currency: string;
  exchange: string;
  feedLatencyMs?: number | null;
}

export interface NormalizedCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickVolume?: number;
  source?: string;
  assetType?: AssetType;
}

export interface OptionGreeks {
  iv?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  pop?: number | null;
}

export interface OptionContractDetails {
  instrumentKey: string;
  symbol: string;
  strikePrice: number;
  type: "CE" | "PE";
  expiry: string;
  ltp: number;
  bid: number | null;
  ask: number | null;
  volume: number;
  oi: number;
  prevOi?: number;
  changeOi?: number;
  greeks?: OptionGreeks;
  lotSize?: number;
}

export interface NormalizedOptionStrikeRow {
  strikePrice: number;
  call?: OptionContractDetails;
  put?: OptionContractDetails;
}

export interface NormalizedOptionChain {
  symbol: string;
  underlyingPrice: number;
  availableExpiries: string[];
  selectedExpiry: string;
  strikes: NormalizedOptionStrikeRow[];
  source: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  assetType: AssetType;
  exchange: string;
  country: string;
  source: string;
}

export interface LatencyReport {
  symbol: string;
  source: string;
  providerTimestamp: number | null;
  receivedTimestamp: number;
  processingTimestamp: number;
  frontendReceivedTimestamp?: number;
  feedLatencyMs: number | null;
  backendLatencyMs: number;
  frontendLatencyMs?: number;
  totalObservedLatencyMs?: number;
}

export interface RealtimeTickMessage {
  type: "tick" | "candle_update" | "status" | "error" | "subscribed" | "unsubscribed" | "pong";
  symbol: string;
  quote?: NormalizedQuote;
  candle?: NormalizedCandle;
  latency?: LatencyReport;
  timestamp: number;
}
