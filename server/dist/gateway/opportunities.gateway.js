"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OpportunitiesGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpportunitiesGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const event_emitter_1 = require("@nestjs/event-emitter");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const arbitrage_service_1 = require("../arbitrage/arbitrage.service");
const execution_service_1 = require("../execution/execution.service");
let OpportunitiesGateway = OpportunitiesGateway_1 = class OpportunitiesGateway {
    arbitrage;
    execution;
    jwtService;
    config;
    server;
    logger = new common_1.Logger(OpportunitiesGateway_1.name);
    constructor(arbitrage, execution, jwtService, config) {
        this.arbitrage = arbitrage;
        this.execution = execution;
        this.jwtService = jwtService;
        this.config = config;
    }
    handleConnection(client) {
        const token = client.handshake.auth?.token || client.handshake.query?.token;
        try {
            this.jwtService.verify(token, { secret: this.config.get('JWT_SECRET') });
            this.logger.log(`Client connected: ${client.id}`);
            const opportunities = this.arbitrage.getActiveOpportunities();
            client.emit('opportunities:snapshot', opportunities);
        }
        catch (err) {
            this.logger.warn(`Unauthorized WS connection rejected: ${client.id} — ${err.message}`);
            client.emit('auth:failed');
            client.disconnect();
        }
    }
    handleDisconnect(client) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }
    onOpportunityFound(opportunity) {
        this.server.emit('opportunity:new', opportunity);
    }
    onOpportunityExpired(id) {
        this.server.emit('opportunity:expired', { id });
    }
    async onTradeExecute(dto, client) {
        try {
            const result = await this.execution.executeTrade(dto);
            client.emit('trade:result', result);
        }
        catch (err) {
            client.emit('trade:result', {
                opportunityId: dto.opportunityId,
                status: 'FAILED',
                error: err.message,
                executedAt: new Date(),
            });
        }
    }
};
exports.OpportunitiesGateway = OpportunitiesGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", Function)
], OpportunitiesGateway.prototype, "server", void 0);
__decorate([
    (0, event_emitter_1.OnEvent)('opportunity.found'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OpportunitiesGateway.prototype, "onOpportunityFound", null);
__decorate([
    (0, event_emitter_1.OnEvent)('opportunity.expired'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OpportunitiesGateway.prototype, "onOpportunityExpired", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('trade:execute'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Function]),
    __metadata("design:returntype", Promise)
], OpportunitiesGateway.prototype, "onTradeExecute", null);
exports.OpportunitiesGateway = OpportunitiesGateway = OpportunitiesGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: '*' } }),
    __metadata("design:paramtypes", [arbitrage_service_1.ArbitrageService,
        execution_service_1.ExecutionService,
        jwt_1.JwtService,
        config_1.ConfigService])
], OpportunitiesGateway);
//# sourceMappingURL=opportunities.gateway.js.map