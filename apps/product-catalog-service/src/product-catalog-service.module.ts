import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module.js';
import { PrismaModule } from './prisma/prsima.module.js';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from '@app/observability';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('product-catalog-service')),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ProductsModule,
    PrismaModule,
  ],
})
export class ProductCatalogServiceModule { }
