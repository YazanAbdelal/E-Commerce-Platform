import { NestFactory } from '@nestjs/core';
import { ProductCatalogServiceModule } from './product-catalog-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ProductCatalogServiceModule);
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
