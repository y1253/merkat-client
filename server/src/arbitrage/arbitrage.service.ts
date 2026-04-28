import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { RawMarket, MarketPair, ArbitrageOpportunity } from '../types/market.types';
import { MarketsService } from '../markets/markets.service';
import { NormalizationService } from '../normalization/normalization.service';

@Injectable()
export class ArbitrageService {
  private readonly logger = new Logger(ArbitrageService.name);
  private activeOpportunities = new Map<string, ArbitrageOpportunity>();
  private recentlyEmitted = new Map<string, number>();

  constructor(
    private marketsService: MarketsService,
    private normalization: NormalizationService,
    private events: EventEmitter2,
    private config: ConfigService,
  ) {}

  @OnEvent('markets.updated')
  onMarketsUpdated(markets: RawMarket[]) {
    const pairs = this.normalization.getAllPairs();
    this.scan(markets, pairs);
  }

  @OnEvent('pairs.updated')
  onPairsUpdated(pairs: MarketPair[]) {
    this.scan(this.marketsService.getAll(), pairs);
  }

  private scan(markets: RawMarket[], pairs: MarketPair[]) {
    const threshold = parseFloat(this.config.get('MIN_PROFIT_THRESHOLD') || '0.005');
    const now = Date.now();
    const found = new Set<string>();

    for (const pair of pairs) {
      const poly = markets.find((m) => m.platform === 'polymarket' && m.id === pair.polymarketId);
      const kalshi = markets.find((m) => m.platform === 'kalshi' && m.id === pair.kalshiId);
      if (!poly || !kalshi) continue;

      // Reject stale prices
      if (now - poly.fetchedAt.getTime() > 60000 || now - kalshi.fetchedAt.getTime() > 60000) continue;

      // Reject pairs resolving on different dates (> 7 days apart)
      if (Math.abs(poly.closesAt.getTime() - kalshi.closesAt.getTime()) > 7 * 24 * 60 * 60 * 1000) continue;

      // Direction 1: YES on Polymarket + NO on Kalshi
      const margin1 = 1 - poly.yesPrice - kalshi.noPrice;
      // Direction 2: YES on Kalshi + NO on Polymarket
      const margin2 = 1 - kalshi.yesPrice - poly.noPrice;

      const bestMargin = Math.max(margin1, margin2);
      if (bestMargin <= threshold) {
        // Opportunity expired
        const expiredId = this.buildId(pair, 'any');
        if (this.activeOpportunities.has(`${pair.polymarketId}_${pair.kalshiId}_YES_POLY_NO_KALSHI`) ||
            this.activeOpportunities.has(`${pair.polymarketId}_${pair.kalshiId}_YES_KALSHI_NO_POLY`)) {
          this.activeOpportunities.delete(`${pair.polymarketId}_${pair.kalshiId}_YES_POLY_NO_KALSHI`);
          this.activeOpportunities.delete(`${pair.polymarketId}_${pair.kalshiId}_YES_KALSHI_NO_POLY`);
          this.events.emit('opportunity.expired', expiredId);
        }
        continue;
      }

      const direction = margin1 >= margin2 ? 'YES_POLY_NO_KALSHI' : 'YES_KALSHI_NO_POLY';
      const margin = Math.max(margin1, margin2);
      const id = `${pair.polymarketId}_${pair.kalshiId}_${direction}`;
      found.add(id);

      // Debounce: suppress same opportunity within 5s
      const lastEmit = this.recentlyEmitted.get(id) || 0;
      if (now - lastEmit < 5000) continue;

      const legA = direction === 'YES_POLY_NO_KALSHI'
        ? { platform: 'polymarket' as const, marketId: poly.id, side: 'YES' as const, price: poly.yesPrice }
        : { platform: 'kalshi' as const, marketId: kalshi.id, side: 'YES' as const, price: kalshi.yesPrice };

      const legB = direction === 'YES_POLY_NO_KALSHI'
        ? { platform: 'kalshi' as const, marketId: kalshi.id, side: 'NO' as const, price: kalshi.noPrice }
        : { platform: 'polymarket' as const, marketId: poly.id, side: 'NO' as const, price: poly.noPrice };

      const opportunity: ArbitrageOpportunity = {
        id,
        pair,
        direction,
        legA,
        legB,
        profitMargin: margin,
        profitDollarsPerUnit: margin,
        detectedAt: new Date(),
        polyTitle: poly.title,
        kalshiTitle: kalshi.title,
        polyClosesAt: poly.closesAt,
        kalshiClosesAt: kalshi.closesAt,
        polyUrl: poly.url,
        kalshiUrl: kalshi.url,
      };

      this.activeOpportunities.set(id, opportunity);
      this.recentlyEmitted.set(id, now);
      this.logger.log(`Opportunity: ${pair.canonicalTitle} margin=${(margin * 100).toFixed(2)}%`);
      this.events.emit('opportunity.found', opportunity);
    }

    // Clean up stale recentlyEmitted entries
    for (const [key, ts] of this.recentlyEmitted) {
      if (now - ts > 10000) this.recentlyEmitted.delete(key);
    }
  }

  // Blind scan: find price discrepancies without semantic matching (used in demo / before normalization finishes)
  private scanBlind(markets: RawMarket[]) {
    const threshold = parseFloat(this.config.get('MIN_PROFIT_THRESHOLD') || '0.005');
    const polyMarkets = markets.filter((m) => m.platform === 'polymarket');
    const kalshiMarkets = markets.filter((m) => m.platform === 'kalshi');
    if (!polyMarkets.length || !kalshiMarkets.length) return;

    type Candidate = { id: string; margin: number; poly: RawMarket; kalshi: RawMarket; direction: 'YES_POLY_NO_KALSHI' | 'YES_KALSHI_NO_POLY' };
    const candidates: Candidate[] = [];

    for (const poly of polyMarkets) {
      for (const kalshi of kalshiMarkets) {
        const margin1 = 1 - poly.yesPrice - kalshi.noPrice;
        const margin2 = 1 - kalshi.yesPrice - poly.noPrice;
        const best = Math.max(margin1, margin2);
        if (best <= threshold) continue;
        const direction = margin1 >= margin2 ? 'YES_POLY_NO_KALSHI' : 'YES_KALSHI_NO_POLY';
        candidates.push({ id: `blind_${poly.id}_${kalshi.id}_${direction}`, margin: best, poly, kalshi, direction });
      }
    }

    // Expire blind opportunities that are no longer profitable
    const validIds = new Set(candidates.map((c) => c.id));
    for (const [id] of this.activeOpportunities) {
      if (id.startsWith('blind_') && !validIds.has(id)) {
        this.activeOpportunities.delete(id);
        this.events.emit('opportunity.expired', id);
      }
    }

    // One best opportunity per poly market, then top 5 overall — avoids 5 copies of the same question
    const bestPerPoly = new Map<string, typeof candidates[0]>();
    for (const c of candidates) {
      const prev = bestPerPoly.get(c.poly.id);
      if (!prev || c.margin > prev.margin) bestPerPoly.set(c.poly.id, c);
    }
    const top = Array.from(bestPerPoly.values())
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
    const now = Date.now();

    for (const c of top) {
      if (this.activeOpportunities.has(c.id)) continue;
      const lastEmit = this.recentlyEmitted.get(c.id) || 0;
      if (now - lastEmit < 5000) continue;

      const syntheticPair: MarketPair = {
        polymarketId: c.poly.id,
        kalshiId: c.kalshi.id,
        confidence: 0.0,
        canonicalTitle: c.poly.title,
        matchedAt: new Date(),
      };

      const legA = c.direction === 'YES_POLY_NO_KALSHI'
        ? { platform: 'polymarket' as const, marketId: c.poly.id, side: 'YES' as const, price: c.poly.yesPrice }
        : { platform: 'kalshi' as const, marketId: c.kalshi.id, side: 'YES' as const, price: c.kalshi.yesPrice };
      const legB = c.direction === 'YES_POLY_NO_KALSHI'
        ? { platform: 'kalshi' as const, marketId: c.kalshi.id, side: 'NO' as const, price: c.kalshi.noPrice }
        : { platform: 'polymarket' as const, marketId: c.poly.id, side: 'NO' as const, price: c.poly.noPrice };

      const opportunity: ArbitrageOpportunity = {
        id: c.id,
        pair: syntheticPair,
        direction: c.direction,
        legA,
        legB,
        profitMargin: c.margin,
        profitDollarsPerUnit: c.margin,
        detectedAt: new Date(),
        polyTitle: c.poly.title,
        kalshiTitle: c.kalshi.title,
        polyClosesAt: c.poly.closesAt,
        kalshiClosesAt: c.kalshi.closesAt,
        polyUrl: c.poly.url,
        kalshiUrl: c.kalshi.url,
      };

      this.activeOpportunities.set(c.id, opportunity);
      this.recentlyEmitted.set(c.id, now);
      this.logger.log(`Blind opportunity: ${c.poly.title.slice(0, 40)} vs ${c.kalshi.title.slice(0, 40)} margin=${(c.margin * 100).toFixed(2)}%`);
      this.events.emit('opportunity.found', opportunity);
    }
  }

  private buildId(pair: MarketPair, direction: string): string {
    return createHash('md5').update(`${pair.polymarketId}:${pair.kalshiId}:${direction}`).digest('hex').slice(0, 8);
  }

  getActiveOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.activeOpportunities.values())
      .sort((a, b) => b.profitMargin - a.profitMargin);
  }
}
