import { ConfigService } from '@nestjs/config';
import { RawMarket } from '../types/market.types';
export declare class KalshiAdapter {
    private config;
    private readonly logger;
    private get baseUrl();
    constructor(config: ConfigService);
    private getAgent;
    private normalizePem;
    private buildAuthHeaders;
    fetchMarkets(): Promise<RawMarket[]>;
    getAuthHeaders(method: string, path: string): Record<string, string> | null;
}
