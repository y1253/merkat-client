"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var NormalizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NormalizationService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const event_emitter_2 = require("@nestjs/event-emitter");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
let NormalizationService = NormalizationService_1 = class NormalizationService {
    events;
    config;
    logger = new common_1.Logger(NormalizationService_1.name);
    openai = null;
    pairCache = new Map();
    constructor(events, config) {
        this.events = events;
        this.config = config;
    }
    onModuleInit() {
        const apiKey = this.config.get('OPENAI_API_KEY');
        if (apiKey) {
            this.openai = new openai_1.default({ apiKey });
            this.logger.log('OpenAI initialized — AI-based market matching enabled');
        }
        else {
            this.logger.warn('OPENAI_API_KEY not set — normalization will use string matching only');
        }
    }
    async onMarketsUpdated(markets) {
        const polyMarkets = markets.filter((m) => m.platform === 'polymarket');
        const kalshiMarkets = markets.filter((m) => m.platform === 'kalshi');
        this.logger.log(`Normalization triggered: ${polyMarkets.length} poly + ${kalshiMarkets.length} kalshi`);
        if (!polyMarkets.length || !kalshiMarkets.length)
            return;
        const newPairs = await this.matchMarkets(polyMarkets, kalshiMarkets);
        if (newPairs.length > 0) {
            this.logger.log(`Found ${newPairs.length} matched pairs`);
            this.events.emit('pairs.updated', this.getAllPairs());
        }
    }
    async matchMarkets(polyMarkets, kalshiMarkets) {
        const bestForPoly = new Map();
        for (const pm of polyMarkets) {
            for (const km of kalshiMarkets) {
                const cacheKey = `${pm.id}:${km.id}`;
                if (this.pairCache.has(cacheKey))
                    continue;
                const similarity = this.stringSimilarity(pm.title, km.title);
                if (similarity >= 0.8) {
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
        const newPairs = [];
        for (const { pair } of bestForPoly.values()) {
            const cacheKey = `${pair.polymarketId}:${pair.kalshiId}`;
            if (!this.pairCache.has(cacheKey)) {
                this.pairCache.set(cacheKey, pair);
                newPairs.push(pair);
            }
        }
        if (this.openai) {
            const pairedPolyIds = new Set(Array.from(this.pairCache.values()).map((p) => p.polymarketId));
            const pairedKalshiIds = new Set(Array.from(this.pairCache.values()).map((p) => p.kalshiId));
            const unmatchedPoly = polyMarkets.filter((pm) => !pairedPolyIds.has(pm.id));
            const unmatchedKalshi = kalshiMarkets.filter((km) => !pairedKalshiIds.has(km.id));
            if (unmatchedPoly.length > 0 && unmatchedKalshi.length > 0) {
                const aiPairs = await this.matchWithAI(unmatchedPoly.slice(0, 50), unmatchedKalshi.slice(0, 50));
                for (const pair of aiPairs) {
                    const cacheKey = `${pair.polymarketId}:${pair.kalshiId}`;
                    this.pairCache.set(cacheKey, pair);
                    newPairs.push(pair);
                }
            }
        }
        return newPairs;
    }
    async matchWithAI(polyMarkets, kalshiMarkets) {
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
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                response_format: { type: 'json_object' },
            });
            const content = response.choices[0].message.content || '{"matches":[]}';
            const parsed = JSON.parse(content);
            const matches = parsed.matches || parsed || [];
            return (Array.isArray(matches) ? matches : [])
                .filter((m) => m.confidence >= 0.85)
                .map((m) => ({
                polymarketId: m.polymarket_id,
                kalshiId: m.kalshi_id,
                confidence: m.confidence,
                canonicalTitle: m.canonical_title,
                matchedAt: new Date(),
            }));
        }
        catch (err) {
            this.logger.error('OpenAI matching failed: ' + err.message);
            return [];
        }
    }
    stringSimilarity(a, b) {
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const na = normalize(a);
        const nb = normalize(b);
        if (na === nb)
            return 1;
        const wordsA = new Set(na.split(' ').filter(Boolean));
        const wordsB = new Set(nb.split(' ').filter(Boolean));
        const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
        const union = new Set([...wordsA, ...wordsB]).size;
        return union === 0 ? 0 : intersection / union;
    }
    getAllPairs() {
        return Array.from(this.pairCache.values());
    }
};
exports.NormalizationService = NormalizationService;
__decorate([
    (0, event_emitter_1.OnEvent)('markets.updated'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], NormalizationService.prototype, "onMarketsUpdated", null);
exports.NormalizationService = NormalizationService = NormalizationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [event_emitter_2.EventEmitter2,
        config_1.ConfigService])
], NormalizationService);
//# sourceMappingURL=normalization.service.js.map