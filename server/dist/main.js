"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
process.env.HTTP_PROXY = '';
process.env.HTTPS_PROXY = '';
process.env.http_proxy = '';
process.env.https_proxy = '';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: true,
        credentials: true,
    });
    await app.listen(process.env.PORT || 3000);
    console.log(`Server running on port ${process.env.PORT || 3000}`);
}
bootstrap();
//# sourceMappingURL=main.js.map