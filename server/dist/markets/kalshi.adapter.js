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
var KalshiAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KalshiAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const https = __importStar(require("https"));
let KalshiAdapter = KalshiAdapter_1 = class KalshiAdapter {
    config;
    logger = new common_1.Logger(KalshiAdapter_1.name);
    get baseUrl() {
        const sandbox = this.config.get('KALSHI_USE_SANDBOX') !== 'false';
        return sandbox
            ? 'https://demo-api.kalshi.co/trade-api/v2'
            : 'https://api.elections.kalshi.com/trade-api/v2';
    }
    constructor(config) {
        this.config = config;
    }
    getAgent() {
        return new https.Agent({ rejectUnauthorized: false });
    }
    normalizePem(raw) {
        const stripped = raw.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
        const body = stripped.match(/.{1,64}/g)?.join('\n') ?? stripped;
        return `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
    }
    buildAuthHeaders(method, path) {
        const keyId = this.config.get('KALSHI_API_KEY_ID');
        const rawKey = this.config.get('KALSHI_PRIVATE_KEY');
        if (!keyId || !rawKey)
            return null;
        const privateKeyPem = this.normalizePem(rawKey);
        try {
            const timestampMs = Date.now();
            const msgToSign = `${timestampMs}${method.toUpperCase()}${path}`;
            const sign = crypto.createSign('RSA-SHA256');
            sign.update(msgToSign);
            sign.end();
            const signature = sign.sign({ key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING }, 'base64');
            return {
                'KALSHI-ACCESS-KEY': keyId,
                'KALSHI-ACCESS-TIMESTAMP': String(timestampMs),
                'KALSHI-ACCESS-SIGNATURE': signature,
                'Content-Type': 'application/json',
            };
        }
        catch (err) {
            this.logger.error('Kalshi RSA signing failed', err.message);
            return null;
        }
    }
    async fetchMarkets() {
        const path = '/trade-api/v2/markets';
        const headers = this.buildAuthHeaders('GET', path);
        if (!headers) {
            this.logger.warn('Kalshi credentials not configured — skipping');
            return [];
        }
        try {
            const markets = [];
            let cursor = '';
            do {
                const params = { limit: 200, status: 'open' };
                if (cursor)
                    params.cursor = cursor;
                const res = await axios_1.default.get(`${this.baseUrl}/markets`, {
                    params,
                    headers,
                    timeout: 15000,
                    httpsAgent: this.getAgent(),
                    proxy: false,
                });
                const data = res.data;
                for (const m of data.markets || []) {
                    const yesAsk = m.yes_ask ?? 50;
                    const yesBid = m.yes_bid ?? 50;
                    const yesPrice = (yesAsk + yesBid) / 2 / 100;
                    if (yesPrice <= 0 || yesPrice >= 1)
                        continue;
                    markets.push({
                        platform: 'kalshi',
                        id: m.ticker,
                        title: m.title,
                        description: m.subtitle || m.rules_primary || '',
                        yesPrice,
                        noPrice: 1 - yesPrice,
                        volume24h: m.volume_24h || 0,
                        closesAt: new Date(m.close_time || Date.now() + 86400000),
                        fetchedAt: new Date(),
                        url: `https://kalshi.com/events/${(m.series_ticker || m.ticker.replace(/-\d{2}[A-Z]{3}.*/, '')).toLowerCase()}`,
                    });
                }
                cursor = data.cursor || '';
                if (markets.length >= 300)
                    break;
            } while (cursor);
            this.logger.log(`Fetched ${markets.length} Kalshi markets`);
            return markets;
        }
        catch (err) {
            const status = err.response?.status;
            const body = err.response?.data ? JSON.stringify(err.response.data) : null;
            this.logger.error(`Failed to fetch Kalshi markets — ${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`);
            return [];
        }
    }
    getAuthHeaders(method, path) {
        return this.buildAuthHeaders(method, path);
    }
};
exports.KalshiAdapter = KalshiAdapter;
exports.KalshiAdapter = KalshiAdapter = KalshiAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], KalshiAdapter);
//# sourceMappingURL=kalshi.adapter.js.map