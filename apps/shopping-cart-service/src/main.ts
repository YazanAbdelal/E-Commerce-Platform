import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { ShoppingCartServiceModule } from './shopping-cart-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ShoppingCartServiceModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3003);
}

await bootstrap();