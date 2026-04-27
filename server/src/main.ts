// Disable system proxy for all outgoing requests
process.env.HTTP_PROXY = '';
process.env.HTTPS_PROXY = '';
process.env.http_proxy = '';
process.env.https_proxy = '';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  //app.enableCors({ origin: process.env.WS_CORS_ORIGIN || 'http://localhost:5173' });
  await app.listen(process.env.PORT || 3001);
  console.log(`Server running on port ${process.env.PORT || 3000}`);
}
bootstrap();
