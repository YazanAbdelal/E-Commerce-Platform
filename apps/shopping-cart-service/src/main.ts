import { NestFactory } from '@nestjs/core';
import { ShoppingCartServiceModule } from './shopping-cart-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ShoppingCartServiceModule);

  await app.listen(process.env.PORT ?? 3003);
}

bootstrap();