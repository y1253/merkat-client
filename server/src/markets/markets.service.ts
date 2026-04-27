import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PolymarketAdapter } from './polymarket.adapter';
import { KalshiAdapter } from './kalshi.adapter';
import { RawMarket } from '../types/market.types';

@Injectable()
export class MarketsService implements OnModuleInit {
  private readonly logger = new Logger(MarketsService.name);
  private allMarkets: RawMarket[] = [];

  constructor(
    private polymarket: PolymarketAdapter,
    private kalshi: KalshiAdapter,
    private events: EventEmitter2,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.poll();
    const interval = parseInt(this.config.get('POLL_INTERVAL_MS') || '30000');
    setInterval(() => this.poll(), interval);
  }

  private async poll() {
    const [rawPolyMarkets, kalshiMarkets] = await Promise.all([
      this.polymarket.fetchMarkets(),
      this.kalshi.fetchMarkets(),
    ]);

    // When Polymarket is blocked, mirror top Kalshi markets with a synthetic price gap
    // so normalization finds pairs immediately (same title = 100% string similarity)
    const polyMarkets = this.polymarket.isDemoMode && kalshiMarkets.length > 0
      ? this.mirrorKalshiAsPolyDemo(kalshiMarkets)
      : rawPolyMarkets;

    this.allMarkets = [...polyMarkets, ...kalshiMarkets];
    this.logger.log(`Markets updated: ${polyMarkets.length} Polymarket + ${kalshiMarkets.length} Kalshi`);
    this.events.emit('markets.updated', this.allMarkets);
  }

  // Generates synthetic Polymarket markets from the top Kalshi markets with a ±3-7% price offset,
  // giving the arbitrage engine real current topics and a guaranteed price spread to detect.
  private mirrorKalshiAsPolyDemo(kalshiMarkets: RawMarket[]): RawMarket[] {
    // One representative market per unique title, sorted by volume
    const uniqueByTitle = new Map<string, RawMarket>();
    for (const m of kalshiMarkets.sort((a, b) => b.volume24h - a.volume24h)) {
      if (!uniqueByTitle.has(m.title)) uniqueByTitle.set(m.title, m);
    }
    const top = Array.from(uniqueByTitle.values()).slice(0, 15);

    return top.map((km, i) => {
      // Alternate direction of price offset so some opps go each way
      const sign = i % 2 === 0 ? 1 : -1;
      const gap = sign * (0.03 + Math.random() * 0.04); // 3–7%
      const yp = Math.max(0.05, Math.min(0.95, km.yesPrice + gap));
      return {
        platform: 'polymarket' as const,
        id: `demo_poly_${i}`,
        title: km.title,
        description: km.description,
        yesPrice: Math.round(yp * 1000) / 1000,
        noPrice: Math.round((1 - yp) * 1000) / 1000,
        volume24h: Math.round(km.volume24h * 0.8),
        closesAt: km.closesAt,
        fetchedAt: new Date(),
      };
    });
  }

  getAll(): RawMarket[] {
    return this.allMarkets;
  }

  getByPlatform(platform: 'polymarket' | 'kalshi'): RawMarket[] {
    return this.allMarkets.filter((m) => m.platform === platform);
  }

  getById(platform: 'polymarket' | 'kalshi', id: string): RawMarket | undefined {
    return this.allMarkets.find((m) => m.platform === platform && m.id === id);
  }
}
