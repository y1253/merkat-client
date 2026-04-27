export interface RawMarket {
    platform: 'polymarket' | 'kalshi';
    id: string;
    title: string;
    description: string;
    yesPrice: number;
    noPrice: number;
    volume24h: number;
    closesAt: Date;
    fetchedAt: Date;
    url?: string;
}
export interface MarketPair {
    polymarketId: string;
    kalshiId: string;
    confidence: number;
    canonicalTitle: string;
    matchedAt: Date;
}
export interface ArbitrageOpportunity {
    id: string;
    pair: MarketPair;
    direction: 'YES_POLY_NO_KALSHI' | 'YES_KALSHI_NO_POLY';
    legA: TradeLeg;
    legB: TradeLeg;
    profitMargin: number;
    profitDollarsPerUnit: number;
    detectedAt: Date;
    polyTitle: string;
    kalshiTitle: string;
    polyClosesAt: Date;
    kalshiClosesAt: Date;
    polyUrl?: string;
    kalshiUrl?: string;
}
export interface TradeLeg {
    platform: 'polymarket' | 'kalshi';
    marketId: string;
    side: 'YES' | 'NO';
    price: number;
}
export interface ExecuteTradeDto {
    opportunityId: string;
    positionSizeDollars: number;
    legA: TradeLeg;
    legB: TradeLeg;
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
    executedAt: Date;
    error?: string;
}
