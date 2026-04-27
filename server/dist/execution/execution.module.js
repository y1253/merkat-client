"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionModule = void 0;
const common_1 = require("@nestjs/common");
const execution_service_1 = require("./execution.service");
const markets_module_1 = require("../markets/markets.module");
let ExecutionModule = class ExecutionModule {
};
exports.ExecutionModule = ExecutionModule;
exports.ExecutionModule = ExecutionModule = __decorate([
    (0, common_1.Module)({
        imports: [markets_module_1.MarketsModule],
        providers: [execution_service_1.ExecutionService],
        exports: [execution_service_1.ExecutionService],
    })
], ExecutionModule);
//# sourceMappingURL=execution.module.js.map