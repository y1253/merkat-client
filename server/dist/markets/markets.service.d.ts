import { OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PolymarketAdapter } from './polymarket.adapter';
import { KalshiAdapter } from './kalshi.adapter';
import { RawMarket } from '../types/market.types';
export declare class MarketsService implements OnModuleInit {
    private polymarket;
    private kalshi;
    private events;
    private config;
    private readonly logger;
    private allMarkets;
    constructor(polymarket: PolymarketAdapter, kalshi: KalshiAdapter, events: EventEmitter2, config: ConfigService);
    onModuleInit(): void;
    private poll;
    private mirrorKalshiAsPolyDemo;
    getAll(): RawMarket[];
    getByPlatform(platform: 'polymarket' | 'kalshi'): RawMarket[];
    getById(platform: 'polymarket' | 'kalshi', id: string): RawMarket | undefined;
}
