import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { MarketsModule } from './markets/markets.module';
import { NormalizationModule } from './normalization/normalization.module';
import { ArbitrageModule } from './arbitrage/arbitrage.module';
import { ExecutionModule } from './execution/execution.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    AuthModule,
    MarketsModule,
    NormalizationModule,
    ArbitrageModule,
    ExecutionModule,
    GatewayModule,
  ],
})
export class AppModule {}
