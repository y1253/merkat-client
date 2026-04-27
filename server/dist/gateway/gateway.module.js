"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayModule = void 0;
const common_1 = require("@nestjs/common");
const opportunities_gateway_1 = require("./opportunities.gateway");
const arbitrage_module_1 = require("../arbitrage/arbitrage.module");
const execution_module_1 = require("../execution/execution.module");
const auth_module_1 = require("../auth/auth.module");
let GatewayModule = class GatewayModule {
};
exports.GatewayModule = GatewayModule;
exports.GatewayModule = GatewayModule = __decorate([
    (0, common_1.Module)({
        imports: [arbitrage_module_1.ArbitrageModule, execution_module_1.ExecutionModule, auth_module_1.AuthModule],
        providers: [opportunities_gateway_1.OpportunitiesGateway],
    })
], GatewayModule);
//# sourceMappingURL=gateway.module.js.map