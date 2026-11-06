
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';

import { CartService } from './cart.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';

describe('CartService', () => {
    let service: CartService;

    const mockCart = {
        id: 1,
        userId: 10,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const prisma = {
        cart: {
            upsert: vi.fn(),
            findUnique: vi.fn(),
        },
        cartItem: {
            upsert: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
    };

    const productCatalogClient = {
        findOne: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();

        service = new CartService(
            prisma as unknown as PrismaService,
            productCatalogClient as unknown as ProductCatalogClient,
        );

        prisma.cart.upsert.mockResolvedValue(mockCart);
        prisma.cartItem.upsert.mockResolvedValue({});
        prisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
        prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

        prisma.cart.findUnique.mockResolvedValue(mockCart);

        productCatalogClient.findOne.mockResolvedValue({
            id: 42,
            name: 'Test Product',
            price: 99.99,
        });
    });

    describe('getCart', () => {
        it('should retrieve or create a cart for the user', async () => {
            await service.getCart(10);

            expect(prisma.cart.upsert).toHaveBeenCalledWith({
                where: { userId: 10 },
                create: { userId: 10 },
                update: {},
                include: { items: true },
            });
        });
    });

    describe('addItem', () => {
        it('should add an existing product to the cart', async () => {
            await service.addItem(10, 42, 2);

            expect(productCatalogClient.findOne).toHaveBeenCalledWith(42);

            expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
                where: {
                    cartId_productId: {
                        cartId: 1,
                        productId: 42,
                    },
                },
                create: {
                    cartId: 1,
                    productId: 42,
                    quantity: 2,
                },
                update: {
                    quantity: { increment: 2 },
                },
            });
        });

        it('should not add a product that does not exist', async () => {
            productCatalogClient.findOne.mockRejectedValue(
                new NotFoundException('Product not found'),
            );

            await expect(
                service.addItem(10, 999, 1),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.cart.upsert).not.toHaveBeenCalled();
            expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
        });

        it('should reject invalid quantities', async () => {
            await expect(
                service.addItem(10, 42, 0),
            ).rejects.toThrow(BadRequestException);

            expect(productCatalogClient.findOne).not.toHaveBeenCalled();
            expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
        });
    });

    describe('updateItem', () => {
        it('should update the quantity of an existing cart item', async () => {
            await service.updateItem(10, 42, 5);

            expect(prisma.cart.findUnique).toHaveBeenCalledWith({
                where: { userId: 10 },
            });

            expect(prisma.cartItem.updateMany).toHaveBeenCalledWith({
                where: {
                    cartId: 1,
                    productId: 42,
                },
                data: { quantity: 5 },
            });

            expect(prisma.cart.upsert).toHaveBeenCalled();
        });

        it('should throw NotFoundException when the cart does not exist', async () => {
            prisma.cart.findUnique.mockResolvedValue(null);

            await expect(
                service.updateItem(10, 42, 5),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.cartItem.updateMany).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException when the product is not in the cart', async () => {
            prisma.cartItem.updateMany.mockResolvedValue({ count: 0 });

            await expect(
                service.updateItem(10, 42, 5),
            ).rejects.toThrow(NotFoundException);
        });

        it('should reject invalid quantities', async () => {
            await expect(
                service.updateItem(10, 42, 0),
            ).rejects.toThrow(BadRequestException);

            expect(prisma.cart.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('removeItem', () => {
        it('should remove an item from the cart', async () => {
            await service.removeItem(10, 42);

            expect(prisma.cart.findUnique).toHaveBeenCalledWith({
                where: { userId: 10 },
            });

            expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
                where: {
                    cartId: 1,
                    productId: 42,
                },
            });
        });

        it('should throw NotFoundException when the cart does not exist', async () => {
            prisma.cart.findUnique.mockResolvedValue(null);

            await expect(
                service.removeItem(10, 42),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException when the product is not in the cart', async () => {
            prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

            await expect(
                service.removeItem(10, 42),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('clearCart', () => {
        it('should remove all items from the cart', async () => {
            prisma.cartItem.deleteMany.mockResolvedValue({ count: 3 });

            await expect(
                service.clearCart(10),
            ).resolves.toEqual({ deletedItems: 3 });

            expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
                where: { cartId: 1 },
            });
        });

        it('should return zero deleted items when the cart does not exist', async () => {
            prisma.cart.findUnique.mockResolvedValue(null);

            await expect(
                service.clearCart(10),
            ).resolves.toEqual({ deletedItems: 0 });

            expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
        });

        it('should return zero when the cart is already empty', async () => {
            prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

            await expect(
                service.clearCart(10),
            ).resolves.toEqual({ deletedItems: 0 });
        });
    });
});
