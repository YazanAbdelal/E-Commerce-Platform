import { Module } from '@nestjs/common';

import { CartController } from './cart.controller.js';
import { CartClient } from '../clients/cart.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Module({
    imports: [AuthModule],
    controllers: [CartController],
    providers: [CartClient, JwtAuthGuard],
})
export class CartModule { }