import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { CartClient } from './clients/cart.client.js';
import { ProductCatalogClient } from './clients/product-catalog.client.js';

import {
  createLoggerConfig,
  createMetricsConfig,
  createHttpMetricsProviders,
  HttpMetricsInterceptor,
} from '@app/observability';

import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('order-service')),
    PrometheusModule.register(createMetricsConfig('order-service')),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [OrderServiceController],
  providers: [
    OrderServiceService,
    JwtAuthGuard,
    CartClient,
    ProductCatalogClient,
    ...createHttpMetricsProviders(),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class OrderServiceModule { }