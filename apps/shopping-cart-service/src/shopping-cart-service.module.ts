import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartModule } from './cart/cart.module.js';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from '@app/observability';

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('shopping-cart-service')),
    ConfigModule.forRoot({ isGlobal: true }),
    CartModule,
  ],
})
export class ShoppingCartServiceModule { }