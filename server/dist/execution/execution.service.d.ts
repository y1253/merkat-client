import { ConfigService } from '@nestjs/config';
import { ExecuteTradeDto, TradeResult } from '../types/market.types';
import { KalshiAdapter } from '../markets/kalshi.adapter';
export declare class ExecutionService {
    private config;
    private kalshiAdapter;
    private readonly logger;
    constructor(config: ConfigService, kalshiAdapter: KalshiAdapter);
    executeTrade(dto: ExecuteTradeDto): Promise<TradeResult>;
    private executeLeg;
    private getPolyAgent;
    private getKalshiAgent;
    private executePolymarketLeg;
    private executeKalshiLeg;
}
