
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

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
    constructor(private readonly cartClient: CartClient) { }

    @Get()
    getCart(@Req() request: Request) {
        return this.cartClient.getCart(
            request.headers.authorization!,
        );
    }

    @Post('items')
    addItem(
        @Req() request: Request,
        @Body() data: { productId: number; quantity: number },
    ) {
        return this.cartClient.addItem(
            request.headers.authorization!,
            data,
        );
    }

    @Patch('items/:productId')
    updateItem(
        @Req() request: Request,
        @Param('productId', ParseIntPipe) productId: number,
        @Body() data: { quantity: number },
    ) {
        return this.cartClient.updateItem(
            request.headers.authorization!,
            productId,
            data,
        );
    }

    @Delete('items/:productId')
    removeItem(
        @Req() request: Request,
        @Param('productId', ParseIntPipe) productId: number,
    ) {
        return this.cartClient.removeItem(
            request.headers.authorization!,
            productId,
        );
    }

    @Delete()
    clearCart(@Req() request: Request) {
        return this.cartClient.clearCart(
            request.headers.authorization!,
        );
    }
}
