import { ConfigService } from '@nestjs/config';
import { RawMarket } from '../types/market.types';
export declare class PolymarketAdapter {
    private config;
    private readonly logger;
    private useDemoMode;
    constructor(config: ConfigService);
    get isDemoMode(): boolean;
    private getAgent;
    fetchMarkets(): Promise<RawMarket[]>;
    private doFetch;
}
