import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { OrderServiceModule } from './order-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(OrderServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  await app.listen(process.env.PORT ?? 3004);
}

await bootstrap();