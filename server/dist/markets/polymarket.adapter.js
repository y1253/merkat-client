"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PolymarketAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolymarketAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
const CLOB_BASE = 'https://clob.polymarket.com';
function makeDemoMarkets() {
    const templates = [
        { title: 'Will the Fed cut interest rates at the June 2026 FOMC meeting?', yesPrice: 0.38 },
        { title: 'Will Bitcoin price exceed $120,000 by end of June 2026?', yesPrice: 0.44 },
        { title: 'Will US CPI inflation fall below 3% in April 2026?', yesPrice: 0.57 },
        { title: 'Will the S&P 500 reach a new all-time high in Q2 2026?', yesPrice: 0.62 },
        { title: 'Will Nvidia stock exceed $200 by end of June 2026?', yesPrice: 0.49 },
        { title: 'Will OpenAI release a new major model by July 2026?', yesPrice: 0.71 },
        { title: 'Will US unemployment rate rise above 5% in 2026?', yesPrice: 0.27 },
        { title: 'Will Ethereum price exceed $5,000 by end of Q2 2026?', yesPrice: 0.36 },
        { title: 'Will a US-China trade deal be reached in 2026?', yesPrice: 0.33 },
        { title: 'Will Apple release a foldable iPhone in 2026?', yesPrice: 0.29 },
    ];
    return templates.map((t, i) => {
        const noise = (Math.random() - 0.5) * 0.04;
        const yp = Math.max(0.05, Math.min(0.95, t.yesPrice + noise));
        return {
            platform: 'polymarket',
            id: `demo_poly_${i}`,
            title: t.title,
            description: '',
            yesPrice: Math.round(yp * 1000) / 1000,
            noPrice: Math.round((1 - yp) * 1000) / 1000,
            volume24h: Math.round(Math.random() * 50000),
            closesAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            fetchedAt: new Date(),
            url: undefined,
        };
    });
}
let PolymarketAdapter = PolymarketAdapter_1 = class PolymarketAdapter {
    config;
    logger = new common_1.Logger(PolymarketAdapter_1.name);
    useDemoMode = false;
    constructor(config) {
        this.config = config;
    }
    get isDemoMode() { return this.useDemoMode; }
    getAgent() {
        const proxyUrl = this.config.get('PROXY_URL');
        if (proxyUrl)
            return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        return new https.Agent({ rejectUnauthorized: false });
    }
    async fetchMarkets() {
        if (this.config.get('PROXY_URL'))
            this.useDemoMode = false;
        if (this.useDemoMode) {
            const demo = makeDemoMarkets();
            this.logger.warn(`Polymarket API blocked — returning ${demo.length} demo markets`);
            return demo;
        }
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 15000));
        try {
            return await Promise.race([this.doFetch(), timeout]);
        }
        catch (err) {
            const status = err.response?.status;
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            this.logger.warn(`Polymarket API unreachable (${status ? `HTTP ${status}: ${detail}` : detail}) — switching to demo mode`);
            this.useDemoMode = true;
            return makeDemoMarkets();
        }
    }
    async doFetch() {
        const markets = [];
        let nextCursor = '';
        let pages = 0;
        do {
            const qs = nextCursor ? `?limit=1000&next_cursor=${encodeURIComponent(nextCursor)}` : '?limit=1000';
            const res = await axios_1.default.get(`${CLOB_BASE}/markets${qs}`, {
                headers: { Accept: 'application/json' },
                httpsAgent: this.getAgent(),
                proxy: false,
                timeout: 12000,
            });
            if (typeof res.data === 'string' && res.data.includes('DOCTYPE')) {
                throw new Error('BLOCKED — HTML response received');
            }
            const batch = res.data.data || [];
            for (const m of batch) {
                if (!m.tokens || m.tokens.length < 2)
                    continue;
                const yesToken = m.tokens.find((t) => t.outcome === 'Yes');
                const noToken = m.tokens.find((t) => t.outcome === 'No');
                if (!yesToken || !noToken)
                    continue;
                const yp = Number(yesToken.price);
                const np = Number(noToken.price);
                if (yp <= 0.01 || yp >= 0.99 || np <= 0.01 || np >= 0.99)
                    continue;
                if (!m.active || m.closed)
                    continue;
                markets.push({
                    platform: 'polymarket',
                    id: m.condition_id,
                    title: m.question || m.market_slug,
                    description: m.description || '',
                    yesPrice: yp,
                    noPrice: np,
                    volume24h: parseFloat(m.volume24hr) || 0,
                    closesAt: new Date(m.end_date_iso || Date.now() + 86400000),
                    fetchedAt: new Date(),
                    url: m.market_slug ? `https://polymarket.com/event/${m.market_slug}` : undefined,
                });
            }
            nextCursor = res.data.next_cursor || '';
            pages++;
            if (!nextCursor || nextCursor === 'LTE=' || pages >= 15)
                break;
            if (markets.length >= 400)
                break;
        } while (true);
        this.logger.log(`Fetched ${markets.length} active Polymarket markets (${pages} pages)`);
        return markets;
    }
};
exports.PolymarketAdapter = PolymarketAdapter;
exports.PolymarketAdapter = PolymarketAdapter = PolymarketAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PolymarketAdapter);
//# sourceMappingURL=polymarket.adapter.js.map