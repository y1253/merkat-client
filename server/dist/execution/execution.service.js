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
var ExecutionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const ethers_1 = require("ethers");
const https_proxy_agent_1 = require("https-proxy-agent");
const kalshi_adapter_1 = require("../markets/kalshi.adapter");
const CLOB_BASE = 'https://clob.polymarket.com';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const CHAIN_ID = 137;
const ORDER_DOMAIN = {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: CTF_EXCHANGE,
};
const ORDER_TYPES = {
    Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
    ],
};
let ExecutionService = ExecutionService_1 = class ExecutionService {
    config;
    kalshiAdapter;
    logger = new common_1.Logger(ExecutionService_1.name);
    constructor(config, kalshiAdapter) {
        this.config = config;
        this.kalshiAdapter = kalshiAdapter;
    }
    async executeTrade(dto) {
        this.logger.log(`Executing trade for opportunity ${dto.opportunityId} size=$${dto.positionSizeDollars}`);
        const [legAResult, legBResult] = await Promise.all([
            this.executeLeg(dto.legA, dto.positionSizeDollars),
            this.executeLeg(dto.legB, dto.positionSizeDollars),
        ]);
        const aFilled = legAResult.status === 'FILLED';
        const bFilled = legBResult.status === 'FILLED';
        const aFailed = legAResult.status === 'FAILED';
        const bFailed = legBResult.status === 'FAILED';
        const aSimulated = legAResult.status === 'SIMULATED';
        const bSimulated = legBResult.status === 'SIMULATED';
        let status;
        if (aFilled && bFilled)
            status = 'SUCCESS';
        else if (aFailed && bFailed)
            status = 'FAILED';
        else if (aSimulated && bSimulated)
            status = 'SIMULATED';
        else if (aFailed || bFailed)
            status = 'PARTIAL';
        else
            status = 'PARTIAL';
        let actualProfitMargin;
        if (legAResult.filledPrice && legBResult.filledPrice) {
            actualProfitMargin = 1 - legAResult.filledPrice - legBResult.filledPrice;
        }
        return {
            opportunityId: dto.opportunityId,
            status,
            legAResult,
            legBResult,
            actualProfitMargin,
            executedAt: new Date(),
        };
    }
    async executeLeg(leg, positionSizeDollars) {
        if (leg.platform === 'polymarket') {
            return this.executePolymarketLeg(leg, positionSizeDollars);
        }
        else {
            return this.executeKalshiLeg(leg, positionSizeDollars);
        }
    }
    getPolyAgent() {
        const proxyUrl = this.config.get('PROXY_URL');
        if (proxyUrl)
            return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        return new https.Agent({ rejectUnauthorized: false });
    }
    getKalshiAgent() {
        return new https.Agent({ rejectUnauthorized: false });
    }
    async executePolymarketLeg(leg, positionSizeDollars) {
        const proxyUrl = this.config.get('PROXY_URL');
        const rawKey = this.config.get('POLYMARKET_WALLET_PRIVATE_KEY') || '';
        const walletKey = rawKey.replace(/[^0-9a-fA-Fx]/g, '');
        const apiKey = this.config.get('POLYMARKET_API_KEY');
        const passphrase = this.config.get('POLYMARKET_PASSPHRASE');
        if (!proxyUrl || !walletKey || !apiKey || !passphrase) {
            return {
                status: 'SIMULATED',
                orderId: `sim_poly_${Date.now()}`,
                filledPrice: leg.price,
                filledAmount: positionSizeDollars,
                error: !proxyUrl
                    ? 'PROXY_URL not configured — Polymarket API is geo-blocked from this machine'
                    : 'Polymarket credentials not configured in .env',
            };
        }
        let wallet;
        try {
            wallet = new ethers_1.ethers.Wallet(walletKey);
        }
        catch (err) {
            return { status: 'FAILED', error: `Invalid POLYMARKET_WALLET_PRIVATE_KEY: ${err.message}` };
        }
        const agent = this.getPolyAgent();
        const axiosConfig = { httpsAgent: agent, proxy: false, timeout: 10000 };
        try {
            const marketRes = await axios_1.default.get(`${CLOB_BASE}/markets/${leg.marketId}`, {
                headers: { Accept: 'application/json' },
                ...axiosConfig,
            });
            const tokens = marketRes.data.tokens || [];
            const token = tokens.find((t) => t.outcome.toLowerCase() === leg.side.toLowerCase());
            if (!token) {
                return { status: 'FAILED', error: `Token not found for ${leg.side} side on market ${leg.marketId}` };
            }
            const tokenId = token.token_id;
            const makerAmountUsdc = BigInt(Math.round(positionSizeDollars * 1e6));
            const takerAmountTokens = BigInt(Math.round((positionSizeDollars / leg.price) * 1e6));
            const salt = BigInt(Math.floor(Math.random() * 1e15));
            const expiration = BigInt(Math.floor(Date.now() / 1000) + 3600);
            const orderValue = {
                salt,
                maker: wallet.address,
                signer: wallet.address,
                taker: '0x0000000000000000000000000000000000000000',
                tokenId: BigInt(tokenId),
                makerAmount: makerAmountUsdc,
                takerAmount: takerAmountTokens,
                expiration,
                nonce: BigInt(0),
                feeRateBps: BigInt(0),
                side: 0,
                signatureType: 0,
            };
            const orderSignature = await wallet.signTypedData(ORDER_DOMAIN, ORDER_TYPES, orderValue);
            const orderBody = JSON.stringify({
                order: {
                    salt: salt.toString(),
                    maker: wallet.address,
                    signer: wallet.address,
                    taker: '0x0000000000000000000000000000000000000000',
                    tokenId: tokenId,
                    makerAmount: makerAmountUsdc.toString(),
                    takerAmount: takerAmountTokens.toString(),
                    expiration: expiration.toString(),
                    nonce: '0',
                    feeRateBps: '0',
                    side: '0',
                    signatureType: '0',
                    signature: orderSignature,
                },
                owner: wallet.address,
                orderType: 'GTC',
            });
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const authMsg = timestamp + 'POST' + '/order' + orderBody;
            const authSignature = await wallet.signMessage(authMsg);
            const headers = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'POLY_ADDRESS': wallet.address,
                'POLY_SIGNATURE': authSignature,
                'POLY_TIMESTAMP': timestamp,
                'POLY_PASSPHRASE': passphrase,
                'POLY_API_KEY': apiKey,
            };
            const res = await axios_1.default.post(`${CLOB_BASE}/order`, orderBody, {
                headers,
                ...axiosConfig,
            });
            const orderId = res.data?.orderID || res.data?.order_id || res.data?.id;
            this.logger.log(`Polymarket order placed: ${orderId}`);
            return {
                status: 'FILLED',
                orderId,
                filledPrice: leg.price,
                filledAmount: positionSizeDollars,
            };
        }
        catch (err) {
            const status = err.response?.status;
            const body = err.response?.data ? JSON.stringify(err.response.data) : null;
            const detail = `${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`;
            this.logger.error(`Polymarket leg failed: ${detail}`);
            return { status: 'FAILED', error: detail };
        }
    }
    async executeKalshiLeg(leg, positionSizeDollars) {
        const sandbox = this.config.get('KALSHI_USE_SANDBOX') !== 'false';
        const baseUrl = sandbox
            ? 'https://demo-api.kalshi.co/trade-api/v2'
            : 'https://api.elections.kalshi.com/trade-api/v2';
        const orderPath = '/trade-api/v2/portfolio/orders';
        const headers = this.kalshiAdapter.getAuthHeaders('POST', orderPath);
        if (!headers) {
            return {
                status: 'SIMULATED',
                orderId: `sim_kalshi_${Date.now()}`,
                filledPrice: leg.price,
                filledAmount: positionSizeDollars,
                error: 'Kalshi credentials not configured in .env',
            };
        }
        try {
            const contractCount = Math.max(1, Math.floor(positionSizeDollars / leg.price));
            const priceField = leg.side === 'YES' ? 'yes_price' : 'no_price';
            const priceCents = Math.round(leg.price * 100);
            const res = await axios_1.default.post(`${baseUrl}/portfolio/orders`, {
                ticker: leg.marketId,
                client_order_id: `arb_${Date.now()}`,
                action: 'buy',
                side: leg.side.toLowerCase(),
                type: 'limit',
                count: contractCount,
                [priceField]: priceCents,
            }, {
                headers,
                timeout: 10000,
                httpsAgent: this.getKalshiAgent(),
                proxy: false,
            });
            this.logger.log(`Kalshi order placed: ${res.data.order?.order_id}`);
            return {
                status: 'FILLED',
                orderId: res.data.order?.order_id,
                filledPrice: leg.price,
                filledAmount: positionSizeDollars,
            };
        }
        catch (err) {
            const status = err.response?.status;
            const body = err.response?.data ? JSON.stringify(err.response.data) : null;
            const detail = `${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`;
            this.logger.error(`Kalshi leg failed: ${detail}`);
            return { status: 'FAILED', error: detail };
        }
    }
};
exports.ExecutionService = ExecutionService;
exports.ExecutionService = ExecutionService = ExecutionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        kalshi_adapter_1.KalshiAdapter])
], ExecutionService);
//# sourceMappingURL=execution.service.js.map