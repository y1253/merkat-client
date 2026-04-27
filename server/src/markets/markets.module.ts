import { Module } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { PolymarketAdapter } from './polymarket.adapter';
import { KalshiAdapter } from './kalshi.adapter';

@Module({
  providers: [MarketsService, PolymarketAdapter, KalshiAdapter],
  exports: [MarketsService, PolymarketAdapter, KalshiAdapter],
})
export class MarketsModule {}
