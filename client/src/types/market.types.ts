export interface TradeLeg {
  platform: 'polymarket' | 'kalshi';
  marketId: string;
  side: 'YES' | 'NO';
  price: number;
}

export interface MarketPair {
  polymarketId: string;
  kalshiId: string;
  confidence: number;
  canonicalTitle: string;
  matchedAt: string;
}

export interface ArbitrageOpportunity {
  id: string;
  pair: MarketPair;
  direction: 'YES_POLY_NO_KALSHI' | 'YES_KALSHI_NO_POLY';
  legA: TradeLeg;
  legB: TradeLeg;
  profitMargin: number;
  profitDollarsPerUnit: number;
  detectedAt: string;
  polyTitle: string;
  kalshiTitle: string;
  polyClosesAt?: string;
  kalshiClosesAt?: string;
  polyUrl?: string;
  kalshiUrl?: string;
}

export interface LegResult {
  status: 'FILLED' | 'PARTIAL_FILL' | 'FAILED' | 'SIMULATED';
  orderId?: string;
  filledPrice?: number;
  filledAmount?: number;
  error?: string;
}

export interface TradeResult {
  opportunityId: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SIMULATED';
  legAResult: LegResult;
  legBResult: LegResult;
  actualProfitMargin?: number;
  executedAt: string;
  error?: string;
}

export interface ExecuteTradeDto {
  opportunityId: string;
  positionSizeDollars: number;
  legA: TradeLeg;
  legB: TradeLeg;
}

export interface TradeHistoryEntry {
  result: TradeResult;
  opportunity: ArbitrageOpportunity;
  positionSizeDollars: number;
}
