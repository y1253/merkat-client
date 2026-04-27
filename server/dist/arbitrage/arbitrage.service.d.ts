import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { RawMarket, MarketPair, ArbitrageOpportunity } from '../types/market.types';
import { MarketsService } from '../markets/markets.service';
import { NormalizationService } from '../normalization/normalization.service';
export declare class ArbitrageService {
    private marketsService;
    private normalization;
    private events;
    private config;
    private readonly logger;
    private activeOpportunities;
    private recentlyEmitted;
    constructor(marketsService: MarketsService, normalization: NormalizationService, events: EventEmitter2, config: ConfigService);
    onMarketsUpdated(markets: RawMarket[]): void;
    onPairsUpdated(pairs: MarketPair[]): void;
    private scan;
    private scanBlind;
    private buildId;
    getActiveOpportunities(): ArbitrageOpportunity[];
}
