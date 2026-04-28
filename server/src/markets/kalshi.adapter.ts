import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import * as https from 'https';
import { RawMarket } from '../types/market.types';

@Injectable()
export class KalshiAdapter {
  private readonly logger = new Logger(KalshiAdapter.name);

  private get baseUrl(): string {
    const sandbox = this.config.get('KALSHI_USE_SANDBOX') !== 'false';
    return sandbox
      ? 'https://demo-api.kalshi.co/trade-api/v2'
      : 'https://api.elections.kalshi.com/trade-api/v2';
  }

  constructor(private config: ConfigService) {}

  private getAgent(): https.Agent {
    return new https.Agent({ rejectUnauthorized: false });
  }

  private normalizePem(raw: string): string {
    const stripped = raw.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
    // Re-wrap as PKCS#1 RSA private key in 64-char lines
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
    const path = '/trade-api/v2/markets';
    const headers = this.buildAuthHeaders('GET', path);
    if (!headers) {
      this.logger.warn('Kalshi credentials not configured — skipping');
      return [];
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

          // Use subtitle as title when title is a compound sports prop list
          const rawTitle: string = m.title || '';
          const title = rawTitle.includes(',') && rawTitle.startsWith('yes ')
            ? (m.subtitle || m.rules_primary || rawTitle)
            : rawTitle;

          markets.push({
            platform: 'kalshi',
            id: m.ticker,
            title,
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
      return markets;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data ? JSON.stringify(err.response.data) : null;
      this.logger.error(
        `Failed to fetch Kalshi markets — ${status ? `HTTP ${status}` : err.code || err.message}${body ? ` — ${body}` : ''}`,
      );
      return [];
    }
  }

  getAuthHeaders(method: string, path: string): Record<string, string> | null {
    return this.buildAuthHeaders(method, path);
  }
}
