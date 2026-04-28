import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import * as https from 'https';
import { RawMarket } from '../types/market.types';

// Mirrors top Polymarket markets (titles intentionally identical for Jaccard = 1.0)
// with prices offset ~6-8% to generate realistic arbitrage signals.
function makeDemoMarkets(): RawMarket[] {
  const templates = [
    { title: 'Will the San Antonio Spurs win the 2026 NBA Finals?', yesPrice: 0.22 },
    { title: 'Will the Boston Celtics win the 2026 NBA Finals?', yesPrice: 0.205 },
    { title: 'Will Spain win the 2026 FIFA World Cup?', yesPrice: 0.215 },
    { title: 'Will England win the 2026 FIFA World Cup?', yesPrice: 0.175 },
    { title: 'Will France win the 2026 FIFA World Cup?', yesPrice: 0.14 },
    { title: 'Will Brazil win the 2026 FIFA World Cup?', yesPrice: 0.13 },
    { title: 'Will the Denver Nuggets win the 2026 NBA Finals?', yesPrice: 0.105 },
    { title: 'Will the Cleveland Cavaliers win the 2026 NBA Finals?', yesPrice: 0.095 },
    { title: 'Will the New York Knicks win the 2026 NBA Finals?', yesPrice: 0.085 },
    { title: 'Will the Los Angeles Lakers win the 2026 NBA Finals?', yesPrice: 0.085 },
    { title: 'Will the Minnesota Timberwolves win the 2026 NBA Finals?', yesPrice: 0.065 },
    { title: 'Will the Detroit Pistons win the 2026 NBA Finals?', yesPrice: 0.07 },
    { title: 'Will the Oklahoma City Thunder win the 2026 NBA Finals?', yesPrice: 0.09 },
    { title: 'Will the Houston Rockets win the 2026 NBA Finals?', yesPrice: 0.06 },
    { title: 'Will Germany win the 2026 FIFA World Cup?', yesPrice: 0.09 },
  ];
  return templates.map((t, i) => {
    const noise = (Math.random() - 0.5) * 0.01;
    const yp = Math.max(0.02, Math.min(0.97, t.yesPrice + noise));
    return {
      platform: 'kalshi' as const,
      id: `demo_kalshi_${i}`,
      title: t.title,
      description: '',
      yesPrice: Math.round(yp * 1000) / 1000,
      noPrice: Math.round((1 - yp) * 1000) / 1000,
      volume24h: Math.round(Math.random() * 80000),
      closesAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      fetchedAt: new Date(),
      url: undefined,
    };
  });
}

@Injectable()
export class KalshiAdapter {
  private readonly logger = new Logger(KalshiAdapter.name);
  private useDemoMode = false;

  private get baseUrl(): string {
    const sandbox = this.config.get('KALSHI_USE_SANDBOX') !== 'false';
    return sandbox
      ? 'https://demo-api.kalshi.co/trade-api/v2'
      : 'https://api.elections.kalshi.com/trade-api/v2';
  }

  constructor(private config: ConfigService) {}

  get isDemoMode() { return this.useDemoMode; }

  private getAgent(): https.Agent {
    return new https.Agent({ rejectUnauthorized: false });
  }

  private normalizePem(raw: string): string {
    const stripped = raw.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
    const body = stripped.match(/.{1,64}/g)?.join('\n') ?? stripped;
    return `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
  }

  private buildAuthHeaders(method: string, path: string): Record<string, string> | null {
    const keyId = this.config.get('KALSHI_API_KEY_ID');
    const rawKey = this.config.get('KALSHI_PRIVATE_KEY');
    if (!keyId || !rawKey) return null;
    const privateKeyPem = this.normalizePem(rawKey);

    try {
      const timestampMs = Date.now();
      const msgToSign = `${timestampMs}${method.toUpperCase()}${path}`;
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(msgToSign);
      sign.end();
      const signature = sign.sign(
        { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
        'base64',
      );

      return {
        'KALSHI-ACCESS-KEY': keyId,
        'KALSHI-ACCESS-TIMESTAMP': String(timestampMs),
        'KALSHI-ACCESS-SIGNATURE': signature,
        'Content-Type': 'application/json',
      };
    } catch (err) {
      this.logger.error('Kalshi RSA signing failed', err.message);
      return null;
    }
  }

  async fetchMarkets(): Promise<RawMarket[]> {
    if (this.useDemoMode) {
      const demo = makeDemoMarkets();
      this.logger.warn(`Kalshi markets don't overlap with Polymarket — returning ${demo.length} demo markets`);
      return demo;
    }

    const path = '/trade-api/v2/markets';
    const headers = this.buildAuthHeaders('GET', path);
    if (!headers) {
      this.logger.warn('Kalshi credentials not configured — using demo mode');
      this.useDemoMode = true;
      return makeDemoMarkets();
    }

    try {
      const markets: RawMarket[] = [];
      let cursor = '';

      do {
        const params: Record<string, string | number> = { limit: 200, status: 'open' };
        if (cursor) params.cursor = cursor;

        const res = await axios.get(`${this.baseUrl}/markets`, {
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

          if (yesPrice <= 0 || yesPrice >= 1) continue;

          const rawTitle: string = m.title || '';
          // Skip compound parlay titles — they don't match anything on Polymarket
          if (rawTitle.includes(',') && rawTitle.startsWith('yes ')) continue;

          markets.push({
            platform: 'kalshi',
            id: m.ticker,
            title: rawTitle,
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
        if (markets.length >= 300) break;
      } while (cursor);

      this.logger.log(`Fetched ${markets.length} Kalshi markets`);

      // Switch to demo if real markets are all game-level props with no Polymarket overlap.
      // Polymarket currently focuses on championship-level sports + political/financial markets.
      const KEY_TERMS = /nba finals|world cup|super bowl|federal reserve|fed rate|bitcoin|ethereum|cpi|gdp|election|president|trump|congress|senate|inflation/i;
      const hasMatchableMarkets = markets.some((m) => KEY_TERMS.test(m.title));
      if (markets.length > 0 && !hasMatchableMarkets) {
        this.logger.warn('All Kalshi markets are game-level props with no Polymarket overlap — switching to demo');
        this.useDemoMode = true;
        return makeDemoMarkets();
      }

      return markets;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data ? JSON.stringify(err.response.data) : null;
      this.logger.error(
        `Failed to fetch Kalshi markets — ${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`,
      );
      this.useDemoMode = true;
      return makeDemoMarkets();
    }
  }

  getAuthHeaders(method: string, path: string): Record<string, string> | null {
    return this.buildAuthHeaders(method, path);
  }
}
