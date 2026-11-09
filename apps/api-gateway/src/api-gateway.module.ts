import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { ProductsModule } from './products/products.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthController } from './auth/auth.controller.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { UsersModule } from './users/users.module.js';
import { UserClientModule } from './clients/user-client.module.js';
import { CartModule } from './cart/cart.module.js';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import {
  createLoggerConfig,
  createMetricsConfig,
  createHttpMetricsProviders,
  HttpMetricsInterceptor,
} from '@app/observability';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('api-gateway')),
    PrometheusModule.register(createMetricsConfig('api-gateway')),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    UsersModule,
    UserClientModule,
  ],
  controllers: [ApiGatewayController, AuthController],
  providers: [
    ApiGatewayService,
    JwtAuthGuard,
    RolesGuard,
    ...createHttpMetricsProviders(),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class ApiGatewayModule { }