import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CartModule } from './cart/cart.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CartModule,
  ],
})
export class ShoppingCartServiceModule { }