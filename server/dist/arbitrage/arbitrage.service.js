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
var ArbitrageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrageService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const markets_service_1 = require("../markets/markets.service");
const normalization_service_1 = require("../normalization/normalization.service");
let ArbitrageService = ArbitrageService_1 = class ArbitrageService {
    marketsService;
    normalization;
    events;
    config;
    logger = new common_1.Logger(ArbitrageService_1.name);
    activeOpportunities = new Map();
    recentlyEmitted = new Map();
    constructor(marketsService, normalization, events, config) {
        this.marketsService = marketsService;
        this.normalization = normalization;
        this.events = events;
        this.config = config;
    }
    onMarketsUpdated(markets) {
        const pairs = this.normalization.getAllPairs();
        this.scan(markets, pairs);
        if (pairs.length === 0) {
            this.scanBlind(markets);
        }
    }
    onPairsUpdated(pairs) {
        this.scan(this.marketsService.getAll(), pairs);
    }
    scan(markets, pairs) {
        const threshold = parseFloat(this.config.get('MIN_PROFIT_THRESHOLD') || '0.005');
        const now = Date.now();
        const found = new Set();
        for (const pair of pairs) {
            const poly = markets.find((m) => m.platform === 'polymarket' && m.id === pair.polymarketId);
            const kalshi = markets.find((m) => m.platform === 'kalshi' && m.id === pair.kalshiId);
            if (!poly || !kalshi)
                continue;
            if (now - poly.fetchedAt.getTime() > 60000 || now - kalshi.fetchedAt.getTime() > 60000)
                continue;
            if (Math.abs(poly.closesAt.getTime() - kalshi.closesAt.getTime()) > 7 * 24 * 60 * 60 * 1000)
                continue;
            const margin1 = 1 - poly.yesPrice - kalshi.noPrice;
            const margin2 = 1 - kalshi.yesPrice - poly.noPrice;
            const bestMargin = Math.max(margin1, margin2);
            if (bestMargin <= threshold) {
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
            const lastEmit = this.recentlyEmitted.get(id) || 0;
            if (now - lastEmit < 5000)
                continue;
            const legA = direction === 'YES_POLY_NO_KALSHI'
                ? { platform: 'polymarket', marketId: poly.id, side: 'YES', price: poly.yesPrice }
                : { platform: 'kalshi', marketId: kalshi.id, side: 'YES', price: kalshi.yesPrice };
            const legB = direction === 'YES_POLY_NO_KALSHI'
                ? { platform: 'kalshi', marketId: kalshi.id, side: 'NO', price: kalshi.noPrice }
                : { platform: 'polymarket', marketId: poly.id, side: 'NO', price: poly.noPrice };
            const opportunity = {
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
        for (const [key, ts] of this.recentlyEmitted) {
            if (now - ts > 10000)
                this.recentlyEmitted.delete(key);
        }
    }
    scanBlind(markets) {
        const threshold = parseFloat(this.config.get('MIN_PROFIT_THRESHOLD') || '0.005');
        const polyMarkets = markets.filter((m) => m.platform === 'polymarket');
        const kalshiMarkets = markets.filter((m) => m.platform === 'kalshi');
        if (!polyMarkets.length || !kalshiMarkets.length)
            return;
        const candidates = [];
        for (const poly of polyMarkets) {
            for (const kalshi of kalshiMarkets) {
                const margin1 = 1 - poly.yesPrice - kalshi.noPrice;
                const margin2 = 1 - kalshi.yesPrice - poly.noPrice;
                const best = Math.max(margin1, margin2);
                if (best <= threshold)
                    continue;
                const direction = margin1 >= margin2 ? 'YES_POLY_NO_KALSHI' : 'YES_KALSHI_NO_POLY';
                candidates.push({ id: `blind_${poly.id}_${kalshi.id}_${direction}`, margin: best, poly, kalshi, direction });
            }
        }
        const validIds = new Set(candidates.map((c) => c.id));
        for (const [id] of this.activeOpportunities) {
            if (id.startsWith('blind_') && !validIds.has(id)) {
                this.activeOpportunities.delete(id);
                this.events.emit('opportunity.expired', id);
            }
        }
        const bestPerPoly = new Map();
        for (const c of candidates) {
            const prev = bestPerPoly.get(c.poly.id);
            if (!prev || c.margin > prev.margin)
                bestPerPoly.set(c.poly.id, c);
        }
        const top = Array.from(bestPerPoly.values())
            .sort((a, b) => b.margin - a.margin)
            .slice(0, 5);
        const now = Date.now();
        for (const c of top) {
            if (this.activeOpportunities.has(c.id))
                continue;
            const lastEmit = this.recentlyEmitted.get(c.id) || 0;
            if (now - lastEmit < 5000)
                continue;
            const syntheticPair = {
                polymarketId: c.poly.id,
                kalshiId: c.kalshi.id,
                confidence: 0.0,
                canonicalTitle: c.poly.title,
                matchedAt: new Date(),
            };
            const legA = c.direction === 'YES_POLY_NO_KALSHI'
                ? { platform: 'polymarket', marketId: c.poly.id, side: 'YES', price: c.poly.yesPrice }
                : { platform: 'kalshi', marketId: c.kalshi.id, side: 'YES', price: c.kalshi.yesPrice };
            const legB = c.direction === 'YES_POLY_NO_KALSHI'
                ? { platform: 'kalshi', marketId: c.kalshi.id, side: 'NO', price: c.kalshi.noPrice }
                : { platform: 'polymarket', marketId: c.poly.id, side: 'NO', price: c.poly.noPrice };
            const opportunity = {
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
    buildId(pair, direction) {
        return (0, crypto_1.createHash)('md5').update(`${pair.polymarketId}:${pair.kalshiId}:${direction}`).digest('hex').slice(0, 8);
    }
    getActiveOpportunities() {
        return Array.from(this.activeOpportunities.values())
            .sort((a, b) => b.profitMargin - a.profitMargin);
    }
};
exports.ArbitrageService = ArbitrageService;
__decorate([
    (0, event_emitter_1.OnEvent)('markets.updated'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], ArbitrageService.prototype, "onMarketsUpdated", null);
__decorate([
    (0, event_emitter_1.OnEvent)('pairs.updated'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], ArbitrageService.prototype, "onPairsUpdated", null);
exports.ArbitrageService = ArbitrageService = ArbitrageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [markets_service_1.MarketsService,
        normalization_service_1.NormalizationService,
        event_emitter_1.EventEmitter2,
        config_1.ConfigService])
], ArbitrageService);
//# sourceMappingURL=arbitrage.service.js.map