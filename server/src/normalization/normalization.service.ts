import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RawMarket, MarketPair } from '../types/market.types';

const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'in', 'by', 'of', 'to', 'be', 'is', 'are', 'and', 'or',
  'for', 'at', 'on', 'before', 'after', 'this', 'that', 'it', 'its', 'with', 'from',
  'as', 'was', 'were', 'has', 'have', 'had', 'not', 'do', 'does', 'did', 'can',
  'could', 'would', 'should', 'may', 'might', 'than', 'then', 'if', 'when', 'who',
  'which', 'what', 'how', 'all', 'any', 'both', 'each', 'more', 'most', 'other',
  'some', 'so', 'very', 'but', 'up', 'out', 'about', 'into', 'during', 'between',
  'above', 'below', 'over', 'under', 'end', 'no', 'there', 'their', 'they', 'we',
  'he', 'she', 'his', 'her', 'our', 'your', 'my', 'exceed', 'reach', 'rise', 'fall',
  'go', 'hit', 'win', 'lose', 'get', 'make', 'take', 'come', 'see', 'know', 'think',
]);

@Injectable()
export class NormalizationService implements OnModuleInit {
  private readonly logger = new Logger(NormalizationService.name);
  private openai: OpenAI | null = null;
  private pairCache = new Map<string, MarketPair>();

  constructor(
    private events: EventEmitter2,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const apiKey = this.config.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI initialized — AI-based market matching enabled');
    } else {
      this.logger.warn('OPENAI_API_KEY not set — normalization will use string matching only');
    }
  }

  @OnEvent('markets.updated')
  async onMarketsUpdated(markets: RawMarket[]) {
    const polyMarkets = markets.filter((m) => m.platform === 'polymarket');
    const kalshiMarkets = markets.filter((m) => m.platform === 'kalshi');
    this.logger.log(`Normalization triggered: ${polyMarkets.length} poly + ${kalshiMarkets.length} kalshi`);
    this.logger.debug(`Sample Kalshi titles: ${kalshiMarkets.slice(0,5).map(m=>m.title).join(' | ')}`);
    this.logger.debug(`Sample Poly titles: ${polyMarkets.slice(0,5).map(m=>m.title).join(' | ')}`);

    if (!polyMarkets.length || !kalshiMarkets.length) return;

    const newPairs = await this.matchMarkets(polyMarkets, kalshiMarkets);
    if (newPairs.length > 0) {
      this.logger.log(`Found ${newPairs.length} matched pairs`);
      this.events.emit('pairs.updated', this.getAllPairs());
    }
  }

  private async matchMarkets(polyMarkets: RawMarket[], kalshiMarkets: RawMarket[]): Promise<MarketPair[]> {
    const bestForPoly = new Map<string, { pair: MarketPair; confidence: number }>();

    for (const pm of polyMarkets) {
      for (const km of kalshiMarkets) {
        const cacheKey = `${pm.id}:${km.id}`;
        if (this.pairCache.has(cacheKey)) continue;

        const similarity = this.stringSimilarity(pm.title, km.title);
        if (similarity >= 0.35) {
          const prev = bestForPoly.get(pm.id);
          if (!prev || similarity > prev.confidence) {
            bestForPoly.set(pm.id, {
              pair: {
                polymarketId: pm.id,
                kalshiId: km.id,
                confidence: similarity,
                canonicalTitle: pm.title,
                matchedAt: new Date(),
              },
              confidence: similarity,
            });
          }
        }
      }
    }

    const newPairs: MarketPair[] = [];
    for (const { pair } of bestForPoly.values()) {
      const cacheKey = `${pair.polymarketId}:${pair.kalshiId}`;
      if (!this.pairCache.has(cacheKey)) {
        this.pairCache.set(cacheKey, pair);
        newPairs.push(pair);
      }
    }

    // OpenAI slow path — skip if key is known bad
    if (this.openai) {
      const pairedPolyIds = new Set(Array.from(this.pairCache.values()).map((p) => p.polymarketId));
      const pairedKalshiIds = new Set(Array.from(this.pairCache.values()).map((p) => p.kalshiId));
      const unmatchedPoly = polyMarkets.filter((pm) => !pairedPolyIds.has(pm.id));
      const unmatchedKalshi = kalshiMarkets.filter((km) => !pairedKalshiIds.has(km.id));

      if (unmatchedPoly.length > 0 && unmatchedKalshi.length > 0) {
        const aiPairs = await this.matchWithAI(
          unmatchedPoly.slice(0, 50),
          unmatchedKalshi.slice(0, 50),
        );
        for (const pair of aiPairs) {
          const cacheKey = `${pair.polymarketId}:${pair.kalshiId}`;
          this.pairCache.set(cacheKey, pair);
          newPairs.push(pair);
        }
      }
    }

    return newPairs;
  }

  private async matchWithAI(polyMarkets: RawMarket[], kalshiMarkets: RawMarket[]): Promise<MarketPair[]> {
    const prompt = `You are a prediction market analyst. Match these markets from two platforms that describe the same real-world event.

POLYMARKET MARKETS:
${polyMarkets.map((m, i) => `${i}. [${m.id}] ${m.title}`).join('\n')}

KALSHI MARKETS:
${kalshiMarkets.map((m, i) => `${i}. [${m.id}] ${m.title}`).join('\n')}

Return ONLY valid JSON in this exact format:
{"matches": [{"polymarket_id": "...", "kalshi_id": "...", "confidence": 0.9, "canonical_title": "normalized question"}]}

Only include pairs with confidence >= 0.85. If no matches, return {"matches": []}. No explanation, only JSON.`;

    this.logger.log(`Calling OpenAI to match ${polyMarkets.length} poly vs ${kalshiMarkets.length} kalshi markets`);
    try {
      const response = await this.openai!.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{"matches":[]}';
      const parsed = JSON.parse(content);
      const matches = parsed.matches || parsed || [];

      return (Array.isArray(matches) ? matches : [])
        .filter((m: any) => m.confidence >= 0.85)
        .map((m: any) => ({
          polymarketId: m.polymarket_id,
          kalshiId: m.kalshi_id,
          confidence: m.confidence,
          canonicalTitle: m.canonical_title,
          matchedAt: new Date(),
        }));
    } catch (err) {
      this.logger.error('OpenAI matching failed: ' + err.message);
      // Disable OpenAI on auth errors to avoid spamming failed requests
      if (err.status === 401 || err.status === 403) {
        this.logger.warn('Disabling OpenAI due to auth failure — using string matching only');
        this.openai = null;
      }
      return [];
    }
  }

  private stringSimilarity(a: string, b: string): number {
    const tokenize = (s: string): Set<string> => {
      const tokens = s
        .toLowerCase()
        .replace(/\$(\d)/g, 'usd$1')
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
      return new Set(tokens);
    };

    const wordsA = tokenize(a);
    const wordsB = tokenize(b);
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  getAllPairs(): MarketPair[] {
    return Array.from(this.pairCache.values());
  }
}
