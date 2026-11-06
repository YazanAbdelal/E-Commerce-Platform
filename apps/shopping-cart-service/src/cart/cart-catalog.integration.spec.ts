
import 'dotenv/config';

import { Test } from '@nestjs/testing';
import {
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { AddressInfo } from 'node:net';

import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { ProductCatalogServiceModule } from '../../../product-catalog-service/src/product-catalog-service.module.js';
import { ProductsService } from '../../../product-catalog-service/src/products/products.service.js';
import { PrismaService as CatalogPrismaService } from '../../../product-catalog-service/src/prisma/prisma.service.js';

import { ShoppingCartServiceModule } from '../shopping-cart-service.module.js';
import { PrismaService as CartPrismaService } from '../prisma/prisma.service.js';

describe('Shopping Cart -> Product Catalog (HTTP integration)', () => {
    let catalogApp: INestApplication;
    let cartApp: INestApplication;

    let catalogPrisma: CatalogPrismaService;
    let cartPrisma: CartPrismaService;
    let productsService: ProductsService;

    let token: string;
    let productId: number;

    const testUserId = 987654321;

    // Preserve the original environment values.
    const originalEnv = {
        DATABASE_URL: process.env.DATABASE_URL,
        CART_DATABASE_URL: process.env.CART_DATABASE_URL,
        PRODUCT_CATALOG_URL: process.env.PRODUCT_CATALOG_URL,
    };

    const validationPipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    });

    beforeAll(async () => {
        // Configure both applications to use their test databases.
        if (!process.env.TEST_DATABASE_URL) {
            throw new Error('TEST_DATABASE_URL is not configured');
        }

        if (!process.env.CART_TEST_DATABASE_URL) {
            throw new Error('CART_TEST_DATABASE_URL is not configured');
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }

        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        process.env.CART_DATABASE_URL = process.env.CART_TEST_DATABASE_URL;

        // Start Product Catalog on an available local port.
        const catalogModule = await Test.createTestingModule({
            imports: [ProductCatalogServiceModule],
        }).compile();

        catalogApp = catalogModule.createNestApplication();
        catalogApp.useGlobalPipes(validationPipe);

        await catalogApp.listen(0, '127.0.0.1');

        const catalogAddress = catalogApp.getHttpServer().address() as AddressInfo;

        // Configure the Cart client to call the actual Catalog HTTP server.
        process.env.PRODUCT_CATALOG_URL =
            `http://127.0.0.1:${catalogAddress.port}`;

        catalogPrisma = catalogApp.get(CatalogPrismaService);
        productsService = catalogApp.get(ProductsService);

        // Start Shopping Cart. ProductCatalogClient is NOT mocked.
        const cartModule = await Test.createTestingModule({
            imports: [ShoppingCartServiceModule],
        }).compile();

        cartApp = cartModule.createNestApplication();
        cartApp.useGlobalPipes(validationPipe);

        await cartApp.init();

        cartPrisma = cartApp.get(CartPrismaService);

        // Generate a real JWT using the application's configured secret.
        const jwtService = cartApp.get(JwtService);
        token = await jwtService.signAsync({ sub: testUserId });

        // Create a real product in the Catalog test database.
        const product = await productsService.create({
            name: `Cart Catalog Integration ${Date.now()}`,
            price: 19.99,
        });

        productId = product.id;
    });

    beforeEach(async () => {
        // Clean only this test's cart data.
        await cartPrisma.cartItem.deleteMany({
            where: {
                cart: { userId: testUserId },
            },
        });

        await cartPrisma.cart.deleteMany({
            where: { userId: testUserId },
        });
    });

    afterAll(async () => {
        // Remove the product created for this test.
        if (productId !== undefined) {
            await catalogPrisma.product.deleteMany({
                where: { id: productId },
            });
        }

        await cartApp?.close();
        await catalogApp?.close();

        // Restore the original environment.
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    it('should add a real Catalog product to the cart over HTTP', async () => {
        const response = await request(cartApp.getHttpServer())
            .post('/cart/items')
            .set('Authorization', `Bearer ${token}`)
            .send({
                productId,
                quantity: 2,
            })
            .expect(201);

        expect(response.body.userId).toBe(testUserId);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0]).toMatchObject({
            productId,
            quantity: 2,
        });

        // Verify the item was persisted in the Cart database.
        const cart = await cartPrisma.cart.findUnique({
            where: { userId: testUserId },
            include: { items: true },
        });

        expect(cart?.items).toHaveLength(1);
        expect(cart?.items[0]).toMatchObject({
            productId,
            quantity: 2,
        });
    });

    it('should return 404 when Catalog does not contain the requested product', async () => {
        await request(cartApp.getHttpServer())
            .post('/cart/items')
            .set('Authorization', `Bearer ${token}`)
            .send({
                productId: 999999999,
                quantity: 1,
            })
            .expect(404);
    });
});
