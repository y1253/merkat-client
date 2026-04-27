import { Module } from '@nestjs/common';
import { OpportunitiesGateway } from './opportunities.gateway';
import { ArbitrageModule } from '../arbitrage/arbitrage.module';
import { ExecutionModule } from '../execution/execution.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ArbitrageModule, ExecutionModule, AuthModule],
  providers: [OpportunitiesGateway],
})
export class GatewayModule {}
