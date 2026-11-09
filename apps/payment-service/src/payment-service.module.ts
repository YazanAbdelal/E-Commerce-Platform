import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PaymentServiceController } from './payment-service.controller.js';
import { PaymentServiceService } from './payment-service.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { OrderClient } from './clients/order.client.js';

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
    LoggerModule.forRoot(createLoggerConfig('payment-service')),
    PrometheusModule.register(createMetricsConfig('payment-service')),
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
  controllers: [PaymentServiceController],
  providers: [
    PaymentServiceService,
    JwtAuthGuard,
    OrderClient,
    ...createHttpMetricsProviders(),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class PaymentServiceModule { }