import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module.js';
import { PrismaModule } from './prisma/prsima.module.js';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import {
  createLoggerConfig,
  createMetricsConfig,
  createHttpMetricsProviders,
  HttpMetricsInterceptor,
} from '@app/observability';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('product-catalog-service')),
    PrometheusModule.register(
      createMetricsConfig('product-catalog-service'),
    ),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ProductsModule,
    PrismaModule,
  ],
  providers: [
    ...createHttpMetricsProviders(),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class ProductCatalogServiceModule { }