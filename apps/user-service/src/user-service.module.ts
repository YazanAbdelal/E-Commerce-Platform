import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LoggerModule } from 'nestjs-pino';
import {
  createLoggerConfig,
  createMetricsConfig,
  createHttpMetricsProviders,
  HttpMetricsInterceptor,
} from '@app/observability';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('user-service')),
    PrometheusModule.register(createMetricsConfig('user-service')),
    ConfigModule.forRoot({ isGlobal: true }), // for loading the .env file into process.env
    PrismaModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    ...createHttpMetricsProviders(),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class UserServiceModule { }
