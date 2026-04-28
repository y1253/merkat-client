import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { RawMarket } from '../types/market.types';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

function makeDemoMarkets(): RawMarket[] {
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
      platform: 'polymarket' as const,
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

@Injectable()
export class PolymarketAdapter {
  private readonly logger = new Logger(PolymarketAdapter.name);
  private useDemoMode = false;

  constructor(private config: ConfigService) {}

  get isDemoMode() { return this.useDemoMode; }

  private getAgent(): https.Agent {
    const proxyUrl = this.config.get<string>('PROXY_URL');
    if (proxyUrl) return new HttpsProxyAgent(proxyUrl) as any;
    return new https.Agent({ rejectUnauthorized: false });
  }

  async fetchMarkets(): Promise<RawMarket[]> {
    if (this.config.get('PROXY_URL')) this.useDemoMode = false;

    if (this.useDemoMode) {
      const demo = makeDemoMarkets();
      this.logger.warn(`Polymarket API blocked — returning ${demo.length} demo markets`);
      return demo;
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timeout')), 15000),
    );

    try {
      return await Promise.race([this.doFetch(), timeout]);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      this.logger.warn(
        `Polymarket API unreachable (${status ? `HTTP ${status}: ${detail}` : detail}) — switching to demo mode`,
      );
      this.useDemoMode = true;
      return makeDemoMarkets();
    }
  }

  private async doFetch(): Promise<RawMarket[]> {
    const markets: RawMarket[] = [];
    const pageSize = 200;
    let offset = 0;
    let pages = 0;

    do {
      const res = await axios.get(`${GAMMA_BASE}/markets`, {
        params: { active: true, closed: false, limit: pageSize, offset },
        headers: { Accept: 'application/json' },
        httpsAgent: this.getAgent(),
        proxy: false,
        timeout: 12000,
      });

      if (typeof res.data === 'string' && res.data.includes('DOCTYPE')) {
        throw new Error('BLOCKED — HTML response received');
      }

      const batch: any[] = Array.isArray(res.data) ? res.data : [];
      for (const m of batch) {
        try {
          const outcomes: string[] = JSON.parse(m.outcomes);
          const prices: string[] = JSON.parse(m.outcomePrices);
          const yesIdx = outcomes.indexOf('Yes');
          const noIdx = outcomes.indexOf('No');
          if (yesIdx === -1 || noIdx === -1) continue;

          const yp = Number(prices[yesIdx]);
          const np = Number(prices[noIdx]);
          if (yp <= 0.01 || yp >= 0.99 || np <= 0.01 || np >= 0.99) continue;

          markets.push({
            platform: 'polymarket',
            id: m.conditionId || m.id,
            title: m.question,
            description: m.description || '',
            yesPrice: Math.round(yp * 1000) / 1000,
            noPrice: Math.round(np * 1000) / 1000,
            volume24h: Number(m.volume24hr) || 0,
            closesAt: new Date(m.endDate || Date.now() + 86400000),
            fetchedAt: new Date(),
            url: m.slug ? `https://polymarket.com/event/${m.slug}` : undefined,
          });
        } catch {
          continue;
        }
      }

      pages++;
      if (batch.length < pageSize || markets.length >= 400) break;
      offset += pageSize;
    } while (true);

    this.logger.log(`Fetched ${markets.length} active Polymarket markets (${pages} pages)`);
    if (markets.length === 0) {
      throw new Error('No active binary Yes/No markets found');
    }
    return markets;
  }
}
