import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { CartClient } from '../clients/cart.client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

type RequestWithId = Request & {
    id: string;
};

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
    constructor(private readonly cartClient: CartClient) { }

    @Get()
    getCart(@Req() request: RequestWithId) {
        return this.cartClient.getCart(
            request.headers.authorization!,
            request.id,
        );
    }

    @Post('items')
    addItem(
        @Req() request: RequestWithId,
        @Body() data: { productId: number; quantity: number },
    ) {
        return this.cartClient.addItem(
            request.headers.authorization!,
            request.id,
            data,
        );
    }

    @Patch('items/:productId')
    updateItem(
        @Req() request: RequestWithId,
        @Param('productId', ParseIntPipe) productId: number,
        @Body() data: { quantity: number },
    ) {
        return this.cartClient.updateItem(
            request.headers.authorization!,
            request.id,
            productId,
            data,
        );
    }

    @Delete('items/:productId')
    removeItem(
        @Req() request: RequestWithId,
        @Param('productId', ParseIntPipe) productId: number,
    ) {
        return this.cartClient.removeItem(
            request.headers.authorization!,
            request.id,
            productId,
        );
    }

    @Delete()
    clearCart(@Req() request: RequestWithId) {
        return this.cartClient.clearCart(
            request.headers.authorization!,
            request.id,
        );
    }
}