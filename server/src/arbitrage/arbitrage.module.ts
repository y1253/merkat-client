import { Module } from '@nestjs/common';
import { ArbitrageService } from './arbitrage.service';
import { MarketsModule } from '../markets/markets.module';
import { NormalizationModule } from '../normalization/normalization.module';

@Module({
  imports: [MarketsModule, NormalizationModule],
  providers: [ArbitrageService],
  exports: [ArbitrageService],
})
export class ArbitrageModule {}
