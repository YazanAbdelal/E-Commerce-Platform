import 'dotenv/config';

import { Test } from '@nestjs/testing';
import {
    INestApplication,
    ValidationPipe,
    NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { ShoppingCartServiceModule } from '../src/shopping-cart-service.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductCatalogClient } from '../src/clients/product-catalog.client.js';

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

describe('Shopping Cart API (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let tokenUser10: string;
    let tokenUser11: string;

    const productCatalogClient = {
        findOne: vi.fn(),
    };

    beforeAll(async () => {
        const testDatabaseUrl = process.env.CART_TEST_DATABASE_URL;

        if (!testDatabaseUrl) {
            throw new Error('CART_TEST_DATABASE_URL is not configured');
        }

        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not configured');
        }

        // Ensure the application connects to the test database.
        process.env.CART_DATABASE_URL = testDatabaseUrl;

        const moduleFixture = await Test.createTestingModule({
            imports: [ShoppingCartServiceModule],
        })
            .overrideProvider(ProductCatalogClient)
            .useValue(productCatalogClient)
            .compile();

        app = moduleFixture.createNestApplication();

        // Match the global validation configuration in main.ts.
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );

        await app.init();

        prisma = app.get(PrismaService);

        // Generate real JWTs using the application's configured JwtService.
        const jwtService = app.get(JwtService);

        tokenUser10 = await jwtService.signAsync({ sub: 10 });
        tokenUser11 = await jwtService.signAsync({ sub: 11 });
    });

    beforeEach(async () => {
        // Clean the test database before each test.
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
        await app?.close();
    });

    describe('Authentication', () => {
        it('should reject requests without an authorization token', async () => {
            await request(app.getHttpServer())
                .get('/cart')
                .expect(401);
        });

        it('should reject invalid JWTs', async () => {
            await request(app.getHttpServer())
                .get('/cart')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });
    });

    describe('GET /cart', () => {
        it('should create and return an empty cart', async () => {
            const response = await request(app.getHttpServer())
                .get('/cart')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .expect(200);

            expect(response.body.userId).toBe(10);
            expect(response.body.items).toEqual([]);
        });

        it('should keep different users carts separate', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 2 })
                .expect(201);

            const response = await request(app.getHttpServer())
                .get('/cart')
                .set('Authorization', `Bearer ${tokenUser11}`)
                .expect(200);

            expect(response.body.userId).toBe(11);
            expect(response.body.items).toEqual([]);
        });
    });

    describe('POST /cart/items', () => {
        it('should add an item to the cart', async () => {
            const response = await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 2 })
                .expect(201);

            expect(response.body.userId).toBe(10);
            expect(response.body.items).toHaveLength(1);
            expect(response.body.items[0]).toMatchObject({
                productId: 42,
                quantity: 2,
            });

            expect(productCatalogClient.findOne).toHaveBeenCalledWith(42);
        });

        it('should increment quantity when adding the same product again', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 2 })
                .expect(201);

            const response = await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 3 })
                .expect(201);

            expect(response.body.items).toHaveLength(1);
            expect(response.body.items[0].quantity).toBe(5);
        });

        it('should reject a non-positive quantity', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 0 })
                .expect(400);
        });

        it('should reject unexpected request properties', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({
                    productId: 42,
                    quantity: 2,
                    unexpected: true,
                })
                .expect(400);
        });

        it('should propagate a Product Catalog not-found error', async () => {
            productCatalogClient.findOne.mockRejectedValue(
                new NotFoundException('Product not found'),
            );

            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 999, quantity: 1 })
                .expect(404);
        });
    });

    describe('PATCH /cart/items/:productId', () => {
        it('should update an item quantity', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 2 })
                .expect(201);

            const response = await request(app.getHttpServer())
                .patch('/cart/items/42')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ quantity: 7 })
                .expect(200);

            expect(response.body.items[0].quantity).toBe(7);
        });

        it('should return 404 when the item does not exist', async () => {
            await request(app.getHttpServer())
                .patch('/cart/items/42')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ quantity: 7 })
                .expect(404);
        });
    });

    describe('DELETE /cart/items/:productId', () => {
        it('should remove an item from the cart', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 2 })
                .expect(201);

            const response = await request(app.getHttpServer())
                .delete('/cart/items/42')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .expect(200);

            expect(response.body.items).toEqual([]);
        });

        it('should return 404 when the item does not exist', async () => {
            await request(app.getHttpServer())
                .delete('/cart/items/42')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .expect(404);
        });
    });

    describe('DELETE /cart', () => {
        it('should clear all cart items', async () => {
            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 42, quantity: 2 })
                .expect(201);

            productCatalogClient.findOne.mockResolvedValue({
                id: 43,
                name: 'Another Product',
                price: 49.99,
            });

            await request(app.getHttpServer())
                .post('/cart/items')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .send({ productId: 43, quantity: 1 })
                .expect(201);

            const response = await request(app.getHttpServer())
                .delete('/cart')
                .set('Authorization', `Bearer ${tokenUser10}`)
                .expect(200);

            expect(response.body.deletedItems).toBe(2);

            const cart = await prisma.cart.findUnique({
                where: { userId: 10 },
                include: { items: true },
            });

            expect(cart).not.toBeNull();
            expect(cart?.items).toHaveLength(0);
        });
    });
});
