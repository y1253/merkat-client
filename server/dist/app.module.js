"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const event_emitter_1 = require("@nestjs/event-emitter");
const auth_module_1 = require("./auth/auth.module");
const markets_module_1 = require("./markets/markets.module");
const normalization_module_1 = require("./normalization/normalization.module");
const arbitrage_module_1 = require("./arbitrage/arbitrage.module");
const execution_module_1 = require("./execution/execution.module");
const gateway_module_1 = require("./gateway/gateway.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            event_emitter_1.EventEmitterModule.forRoot(),
            auth_module_1.AuthModule,
            markets_module_1.MarketsModule,
            normalization_module_1.NormalizationModule,
            arbitrage_module_1.ArbitrageModule,
            execution_module_1.ExecutionModule,
            gateway_module_1.GatewayModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map