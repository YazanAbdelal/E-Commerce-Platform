import { NestFactory } from '@nestjs/core';
import { ProductCatalogServiceModule } from './product-catalog-service.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(ProductCatalogServiceModule);
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // strips properties that have no validation decorators.
    forbidNonWhitelisted: true, // rejects requests containing unexpecred properties.
    transform: true, // transforms incoming payloads into DTO instances.
  }));
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
