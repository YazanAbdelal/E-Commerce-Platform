import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ShoppingCartServiceModule } from './shopping-cart-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ShoppingCartServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3003);
}

bootstrap();