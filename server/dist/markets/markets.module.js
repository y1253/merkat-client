"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketsModule = void 0;
const common_1 = require("@nestjs/common");
const markets_service_1 = require("./markets.service");
const polymarket_adapter_1 = require("./polymarket.adapter");
const kalshi_adapter_1 = require("./kalshi.adapter");
let MarketsModule = class MarketsModule {
};
exports.MarketsModule = MarketsModule;
exports.MarketsModule = MarketsModule = __decorate([
    (0, common_1.Module)({
        providers: [markets_service_1.MarketsService, polymarket_adapter_1.PolymarketAdapter, kalshi_adapter_1.KalshiAdapter],
        exports: [markets_service_1.MarketsService, polymarket_adapter_1.PolymarketAdapter, kalshi_adapter_1.KalshiAdapter],
    })
], MarketsModule);
//# sourceMappingURL=markets.module.js.map