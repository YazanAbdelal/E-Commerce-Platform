import { Module } from '@nestjs/common';

import { OrdersController } from './orders.controller.js';
import { OrderClient } from '../clients/order.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Module({
    imports: [AuthModule],
    controllers: [OrdersController],
    providers: [OrderClient, JwtAuthGuard],
})
export class OrdersModule { }