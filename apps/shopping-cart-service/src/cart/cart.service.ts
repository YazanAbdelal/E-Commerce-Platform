import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';

@Injectable()
export class CartService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly productCatalogClient: ProductCatalogClient,
    ) { }

    async getCart(userId: number) {
        return this.prisma.cart.upsert({
            where: { userId },
            create: { userId },
            update: {},
            include: { items: true },
        });
    }

    async addItem(userId: number, productId: number, quantity: number) {
        this.validateQuantity(quantity);

        // Verify that the product exists.
        await this.productCatalogClient.findOne(productId);

        const cart = await this.getCart(userId);

        await this.prisma.cartItem.upsert({
            where: {
                cartId_productId: {
                    cartId: cart.id,
                    productId,
                },
            },
            create: {
                cartId: cart.id,
                productId,
                quantity,
            },
            update: {
                quantity: { increment: quantity },
            },
        });

        return this.getCart(userId);
    }

    async updateItem(userId: number, productId: number, quantity: number) {
        this.validateQuantity(quantity);

        const cart = await this.prisma.cart.findUnique({
            where: { userId },
        });

        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        const result = await this.prisma.cartItem.updateMany({
            where: {
                cartId: cart.id,
                productId,
            },
            data: { quantity },
        });

        if (result.count === 0) {
            throw new NotFoundException('Product not found in cart');
        }

        return this.getCart(userId);
    }

    async removeItem(userId: number, productId: number) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
        });

        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        const result = await this.prisma.cartItem.deleteMany({
            where: {
                cartId: cart.id,
                productId,
            },
        });

        if (result.count === 0) {
            throw new NotFoundException('Product not found in cart');
        }

        return this.getCart(userId);
    }

    async clearCart(userId: number) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
        });

        if (!cart) {
            return { deletedItems: 0 };
        }

        const result = await this.prisma.cartItem.deleteMany({
            where: { cartId: cart.id },
        });

        return { deletedItems: result.count };
    }

    private validateQuantity(quantity: number) {
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new BadRequestException(
                'Quantity must be a positive integer',
            );
        }
    }
}