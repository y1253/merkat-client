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
var MarketsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketsService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const config_1 = require("@nestjs/config");
const polymarket_adapter_1 = require("./polymarket.adapter");
const kalshi_adapter_1 = require("./kalshi.adapter");
let MarketsService = MarketsService_1 = class MarketsService {
    polymarket;
    kalshi;
    events;
    config;
    logger = new common_1.Logger(MarketsService_1.name);
    allMarkets = [];
    constructor(polymarket, kalshi, events, config) {
        this.polymarket = polymarket;
        this.kalshi = kalshi;
        this.events = events;
        this.config = config;
    }
    onModuleInit() {
        this.poll();
        const interval = parseInt(this.config.get('POLL_INTERVAL_MS') || '30000');
        setInterval(() => this.poll(), interval);
    }
    async poll() {
        const [rawPolyMarkets, kalshiMarkets] = await Promise.all([
            this.polymarket.fetchMarkets(),
            this.kalshi.fetchMarkets(),
        ]);
        const polyMarkets = this.polymarket.isDemoMode && kalshiMarkets.length > 0
            ? this.mirrorKalshiAsPolyDemo(kalshiMarkets)
            : rawPolyMarkets;
        this.allMarkets = [...polyMarkets, ...kalshiMarkets];
        this.logger.log(`Markets updated: ${polyMarkets.length} Polymarket + ${kalshiMarkets.length} Kalshi`);
        this.events.emit('markets.updated', this.allMarkets);
    }
    mirrorKalshiAsPolyDemo(kalshiMarkets) {
        const uniqueByTitle = new Map();
        for (const m of kalshiMarkets.sort((a, b) => b.volume24h - a.volume24h)) {
            if (!uniqueByTitle.has(m.title))
                uniqueByTitle.set(m.title, m);
        }
        const top = Array.from(uniqueByTitle.values()).slice(0, 15);
        return top.map((km, i) => {
            const sign = i % 2 === 0 ? 1 : -1;
            const gap = sign * (0.03 + Math.random() * 0.04);
            const yp = Math.max(0.05, Math.min(0.95, km.yesPrice + gap));
            return {
                platform: 'polymarket',
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
    getAll() {
        return this.allMarkets;
    }
    getByPlatform(platform) {
        return this.allMarkets.filter((m) => m.platform === platform);
    }
    getById(platform, id) {
        return this.allMarkets.find((m) => m.platform === platform && m.id === id);
    }
};
exports.MarketsService = MarketsService;
exports.MarketsService = MarketsService = MarketsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [polymarket_adapter_1.PolymarketAdapter,
        kalshi_adapter_1.KalshiAdapter,
        event_emitter_1.EventEmitter2,
        config_1.ConfigService])
], MarketsService);
//# sourceMappingURL=markets.service.js.map