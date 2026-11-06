
import 'dotenv/config';

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { CartService } from './cart.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';

describe('CartService integration', () => {
    let prisma: PrismaService;
    let service: CartService;

    const productCatalogClient = {
        findOne: vi.fn(),
    };

    beforeAll(async () => {
        const testDatabaseUrl = process.env.CART_TEST_DATABASE_URL;

        if (!testDatabaseUrl) {
            throw new Error('CART_TEST_DATABASE_URL is not configured');
        }

        // Make PrismaService connect to the test database.
        process.env.CART_DATABASE_URL = testDatabaseUrl;

        prisma = new PrismaService();
        await prisma.$connect();

        service = new CartService(
            prisma,
            productCatalogClient as unknown as ProductCatalogClient,
        );
    });

    beforeEach(async () => {
        // Clean the database before every test.
        await prisma.cartItem.deleteMany();
        await prisma.cart.deleteMany();

        productCatalogClient.findOne.mockReset();
        productCatalogClient.findOne.mockResolvedValue({
            id: 42,
            name: 'Test Product',
            price: 99.99,
        });
    });

    afterAll(async () => {
        await prisma?.$disconnect();
    });

    describe('getCart', () => {
        it('should create a cart when the user does not have one', async () => {
            const cart = await service.getCart(10);

            expect(cart.userId).toBe(10);
            expect(cart.items).toHaveLength(0);

            const savedCart = await prisma.cart.findUnique({
                where: { userId: 10 },
            });

            expect(savedCart).not.toBeNull();
        });

        it('should return the existing cart instead of creating another one', async () => {
            const firstCart = await service.getCart(10);
            const secondCart = await service.getCart(10);

            expect(secondCart.id).toBe(firstCart.id);

            const cartCount = await prisma.cart.count({
                where: { userId: 10 },
            });

            expect(cartCount).toBe(1);
        });
    });

    describe('addItem', () => {
        it('should persist an item in the database', async () => {
            const cart = await service.addItem(10, 42, 2);

            expect(cart.items).toHaveLength(1);
            expect(cart.items[0]).toMatchObject({
                productId: 42,
                quantity: 2,
            });

            const savedItem = await prisma.cartItem.findFirst({
                where: {
                    cart: { userId: 10 },
                    productId: 42,
                },
            });

            expect(savedItem?.quantity).toBe(2);
        });

        it('should increment quantity when adding the same product again', async () => {
            await service.addItem(10, 42, 2);
            const cart = await service.addItem(10, 42, 3);

            expect(cart.items).toHaveLength(1);
            expect(cart.items[0].quantity).toBe(5);

            const itemCount = await prisma.cartItem.count({
                where: {
                    cart: { userId: 10 },
                    productId: 42,
                },
            });

            expect(itemCount).toBe(1);
        });
    });

    describe('updateItem', () => {
        it('should update the persisted quantity', async () => {
            await service.addItem(10, 42, 2);

            const cart = await service.updateItem(10, 42, 7);

            expect(cart.items[0].quantity).toBe(7);

            const savedItem = await prisma.cartItem.findFirst({
                where: {
                    cart: { userId: 10 },
                    productId: 42,
                },
            });

            expect(savedItem?.quantity).toBe(7);
        });
    });

    describe('removeItem', () => {
        it('should remove an item from the database', async () => {
            await service.addItem(10, 42, 2);

            await service.removeItem(10, 42);

            const savedItem = await prisma.cartItem.findFirst({
                where: {
                    cart: { userId: 10 },
                    productId: 42,
                },
            });

            expect(savedItem).toBeNull();
        });
    });

    describe('clearCart', () => {
        it('should remove all items while preserving the cart', async () => {
            await service.addItem(10, 42, 2);

            productCatalogClient.findOne.mockResolvedValue({
                id: 43,
                name: 'Another Product',
                price: 49.99,
            });

            await service.addItem(10, 43, 1);

            const result = await service.clearCart(10);

            expect(result.deletedItems).toBe(2);

            const savedCart = await prisma.cart.findUnique({
                where: { userId: 10 },
                include: { items: true },
            });

            expect(savedCart).not.toBeNull();
            expect(savedCart?.items).toHaveLength(0);
        });
    });
});
