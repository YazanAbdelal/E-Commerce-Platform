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

import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
    constructor(private readonly cartService: CartService) { }

    @Get()
    getCart(@Req() request: AuthenticatedRequest) {
        return this.cartService.getCart(request.user.sub);
    }

    @Post('items')
    addItem(
        @Req() request: AuthenticatedRequest,
        @Body() dto: AddCartItemDto,
    ) {
        return this.cartService.addItem(
            request.user.sub,
            dto.productId,
            dto.quantity,
        );
    }

    @Patch('items/:productId')
    updateItem(
        @Req() request: AuthenticatedRequest,
        @Param('productId', ParseIntPipe) productId: number,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(
            request.user.sub,
            productId,
            dto.quantity,
        );
    }

    @Delete('items/:productId')
    removeItem(
        @Req() request: AuthenticatedRequest,
        @Param('productId', ParseIntPipe) productId: number,
    ) {
        return this.cartService.removeItem(
            request.user.sub,
            productId,
        );
    }

    @Delete()
    clearCart(@Req() request: AuthenticatedRequest) {
        return this.cartService.clearCart(request.user.sub);
    }
}