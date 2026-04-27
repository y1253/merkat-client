import { OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { RawMarket, MarketPair } from '../types/market.types';
export declare class NormalizationService implements OnModuleInit {
    private events;
    private config;
    private readonly logger;
    private openai;
    private pairCache;
    constructor(events: EventEmitter2, config: ConfigService);
    onModuleInit(): void;
    onMarketsUpdated(markets: RawMarket[]): Promise<void>;
    private matchMarkets;
    private matchWithAI;
    private stringSimilarity;
    getAllPairs(): MarketPair[];
}
