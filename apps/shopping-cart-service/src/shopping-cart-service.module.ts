import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartModule } from './cart/cart.module.js';
import { LoggerModule } from 'nestjs-pino';
import {
  createLoggerConfig,
  createMetricsConfig,
  createHttpMetricsProviders,
  HttpMetricsInterceptor,
} from '@app/observability';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('shopping-cart-service')),
    PrometheusModule.register(createMetricsConfig('shopping-cart-service')),
    ConfigModule.forRoot({ isGlobal: true }),
    CartModule,
  ],
  providers: [
    ...createHttpMetricsProviders(),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class ShoppingCartServiceModule { }