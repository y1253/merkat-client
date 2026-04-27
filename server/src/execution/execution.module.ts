import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { MarketsModule } from '../markets/markets.module';

@Module({
  imports: [MarketsModule],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
