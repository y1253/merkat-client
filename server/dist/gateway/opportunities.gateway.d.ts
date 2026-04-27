import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ArbitrageService } from '../arbitrage/arbitrage.service';
import { ExecutionService } from '../execution/execution.service';
import type { ArbitrageOpportunity, ExecuteTradeDto } from '../types/market.types';
export declare class OpportunitiesGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private arbitrage;
    private execution;
    private jwtService;
    private config;
    server: Server;
    private readonly logger;
    constructor(arbitrage: ArbitrageService, execution: ExecutionService, jwtService: JwtService, config: ConfigService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    onOpportunityFound(opportunity: ArbitrageOpportunity): void;
    onOpportunityExpired(id: string): void;
    onTradeExecute(dto: ExecuteTradeDto, client: Socket): Promise<void>;
}
