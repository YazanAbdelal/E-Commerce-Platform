import {
    Controller,
    Get,
    Post,
    Param,
    ParseIntPipe,
    Req,
    UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { OrderClient } from '../clients/order.client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

type RequestWithId = Request & {
    id: string;
};

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly orderClient: OrderClient) { }

    @Post()
    createOrder(@Req() request: RequestWithId) {
        return this.orderClient.createOrder(
            request.headers.authorization!,
            request.id,
        );
    }

    @Get()
    getOrders(@Req() request: RequestWithId) {
        return this.orderClient.getOrders(
            request.headers.authorization!,
            request.id,
        );
    }

    @Get(':id')
    getOrder(
        @Req() request: RequestWithId,
        @Param('id', ParseIntPipe) orderId: number,
    ) {
        return this.orderClient.getOrder(
            request.headers.authorization!,
            request.id,
            orderId,
        );
    }
}