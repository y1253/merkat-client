import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ArbitrageService } from '../arbitrage/arbitrage.service';
import { ExecutionService } from '../execution/execution.service';
import type { ArbitrageOpportunity, ExecuteTradeDto } from '../types/market.types';

@WebSocketGateway({ cors: { origin: '*' } })
export class OpportunitiesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(OpportunitiesGateway.name);

  constructor(
    private arbitrage: ArbitrageService,
    private execution: ExecutionService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token as string;
    try {
      this.jwtService.verify(token, { secret: this.config.get('JWT_SECRET') });
      this.logger.log(`Client connected: ${client.id}`);
      const opportunities = this.arbitrage.getActiveOpportunities();
      client.emit('opportunities:snapshot', opportunities);
    } catch (err) {
      this.logger.warn(`Unauthorized WS connection rejected: ${client.id} — ${err.message}`);
      client.emit('auth:failed');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @OnEvent('opportunity.found')
  onOpportunityFound(opportunity: ArbitrageOpportunity) {
    this.server.emit('opportunity:new', opportunity);
  }

  @OnEvent('opportunity.expired')
  onOpportunityExpired(id: string) {
    this.server.emit('opportunity:expired', { id });
  }

  @SubscribeMessage('trade:execute')
  async onTradeExecute(
    @MessageBody() dto: ExecuteTradeDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.execution.executeTrade(dto);
      client.emit('trade:result', result);
    } catch (err) {
      client.emit('trade:result', {
        opportunityId: dto.opportunityId,
        status: 'FAILED',
        error: err.message,
        executedAt: new Date(),
      });
    }
  }
}
