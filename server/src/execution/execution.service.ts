import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ExecuteTradeDto, TradeResult, LegResult, TradeLeg } from '../types/market.types';
import { KalshiAdapter } from '../markets/kalshi.adapter';

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

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private config: ConfigService,
    private kalshiAdapter: KalshiAdapter,
  ) {}

  async executeTrade(dto: ExecuteTradeDto): Promise<TradeResult> {
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

    let status: TradeResult['status'];
    if (aFilled && bFilled) status = 'SUCCESS';
    else if (aFailed && bFailed) status = 'FAILED';
    else if (aSimulated && bSimulated) status = 'SIMULATED';
    else if (aFailed || bFailed) status = 'PARTIAL';
    else status = 'PARTIAL'; // one FILLED + one SIMULATED

    let actualProfitMargin: number | undefined;
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

  private async executeLeg(leg: TradeLeg, positionSizeDollars: number): Promise<LegResult> {
    if (leg.platform === 'polymarket') {
      return this.executePolymarketLeg(leg, positionSizeDollars);
    } else {
      return this.executeKalshiLeg(leg, positionSizeDollars);
    }
  }

  private getPolyAgent(): https.Agent {
    const proxyUrl = this.config.get<string>('PROXY_URL');
    if (proxyUrl) return new HttpsProxyAgent(proxyUrl) as any;
    return new https.Agent({ rejectUnauthorized: false });
  }

  private getKalshiAgent(): https.Agent {
    return new https.Agent({ rejectUnauthorized: false });
  }

  private async executePolymarketLeg(leg: TradeLeg, positionSizeDollars: number): Promise<LegResult> {
    const proxyUrl = this.config.get<string>('PROXY_URL');
    const rawKey = this.config.get<string>('POLYMARKET_WALLET_PRIVATE_KEY') || '';
    // Strip any trailing non-hex characters (e.g. a stray 'S' from copy-paste)
    const walletKey = rawKey.replace(/[^0-9a-fA-Fx]/g, '');
    const apiKey = this.config.get<string>('POLYMARKET_API_KEY');
    const passphrase = this.config.get<string>('POLYMARKET_PASSPHRASE');

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

    let wallet: ethers.Wallet;
    try {
      wallet = new ethers.Wallet(walletKey);
    } catch (err) {
      return { status: 'FAILED', error: `Invalid POLYMARKET_WALLET_PRIVATE_KEY: ${err.message}` };
    }

    const agent = this.getPolyAgent();
    const axiosConfig = { httpsAgent: agent, proxy: false as any, timeout: 10000 };

    try {
      // 1. Get token ID for this market + side
      const marketRes = await axios.get(`${CLOB_BASE}/markets/${leg.marketId}`, {
        headers: { Accept: 'application/json' },
        ...axiosConfig,
      });
      const tokens: { token_id: string; outcome: string }[] = marketRes.data.tokens || [];
      const token = tokens.find((t) => t.outcome.toLowerCase() === leg.side.toLowerCase());
      if (!token) {
        return { status: 'FAILED', error: `Token not found for ${leg.side} side on market ${leg.marketId}` };
      }
      const tokenId = token.token_id;

      // 2. Build EIP-712 order
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
        side: 0, // BUY
        signatureType: 0, // EOA
      };

      const orderSignature = await wallet.signTypedData(ORDER_DOMAIN, ORDER_TYPES, orderValue);

      // 3. Build L2 auth headers (personal_sign of timestamp+method+path+body)
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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'POLY_ADDRESS': wallet.address,
        'POLY_SIGNATURE': authSignature,
        'POLY_TIMESTAMP': timestamp,
        'POLY_PASSPHRASE': passphrase,
        'POLY_API_KEY': apiKey,
      };

      // 4. Submit order
      const res = await axios.post(`${CLOB_BASE}/order`, orderBody, {
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
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data ? JSON.stringify(err.response.data) : null;
      const detail = `${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`;
      this.logger.error(`Polymarket leg failed: ${detail}`);
      return { status: 'FAILED', error: detail };
    }
  }

  private async executeKalshiLeg(leg: TradeLeg, positionSizeDollars: number): Promise<LegResult> {
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
      // Kalshi uses integer cents (1–99) for yes_price / no_price
      const priceField = leg.side === 'YES' ? 'yes_price' : 'no_price';
      const priceCents = Math.round(leg.price * 100);
      const res = await axios.post(
        `${baseUrl}/portfolio/orders`,
        {
          ticker: leg.marketId,
          client_order_id: `arb_${Date.now()}`,
          action: 'buy',
          side: leg.side.toLowerCase(),
          type: 'limit',
          count: contractCount,
          [priceField]: priceCents,
        },
        {
          headers,
          timeout: 10000,
          httpsAgent: this.getKalshiAgent(),
          proxy: false as any,
        },
      );
      this.logger.log(`Kalshi order placed: ${res.data.order?.order_id}`);
      return {
        status: 'FILLED',
        orderId: res.data.order?.order_id,
        filledPrice: leg.price,
        filledAmount: positionSizeDollars,
      };
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data ? JSON.stringify(err.response.data) : null;
      const detail = `${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`;
      this.logger.error(`Kalshi leg failed: ${detail}`);
      return { status: 'FAILED', error: detail };
    }
  }
}
