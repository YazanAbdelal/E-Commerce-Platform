import 'dotenv/config';

import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Redis } from 'ioredis';

import { ProductCatalogServiceModule } from '../src/product-catalog-service.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../src/cache/redis.provider.js';

// The client fails commands fast instead of queueing them, so tests have to
// wait for the socket before touching the cache.
async function waitForRedis(redis: Redis): Promise<void> {
    if (redis.status === 'ready') {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error('Redis did not become ready')),
            5_000,
        );

        redis.once('ready', () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

describe('Products (E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let redis: Redis;

    const createdProductIds: number[] = [];

    beforeAll(async () => {
        if (!process.env.TEST_DATABASE_URL) {
            throw new Error('TEST_DATABASE_URL is not defined');
        }

        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        process.env.REDIS_URL =
            process.env.REDIS_TEST_URL ?? 'redis://localhost:6379/15';

        const moduleFixture: TestingModule =
            await Test.createTestingModule({
                imports: [ProductCatalogServiceModule],
            }).compile();

        app = moduleFixture.createNestApplication();

        // Apply the same validation configuration as main.ts.
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );

        prisma = app.get<PrismaService>(PrismaService);
        redis = app.get<Redis>(REDIS_CLIENT);

        await app.init();
        await waitForRedis(redis);
        await redis.flushdb();
    });

    afterEach(async () => {
        if (createdProductIds.length > 0) {
            await prisma.product.deleteMany({
                where: {
                    id: { in: createdProductIds },
                },
            });

            createdProductIds.length = 0;
        }
    });

    afterAll(async () => {
        await app.close();
    });

    async function createTestProduct() {
        const product = await prisma.product.create({
            data: {
                name: 'E2E Test Product',
                price: 19.99,
            },
        });

        createdProductIds.push(product.id);

        return product;
    }

    it('POST /products should create a product', async () => {
        const response = await request(app.getHttpServer())
            .post('/products')
            .send({
                name: 'New Product',
                price: 49.99,
            })
            .expect(201);

        expect(response.body).toMatchObject({
            name: 'New Product',
            price: 49.99,
        });

        createdProductIds.push(response.body.id);

        expect(response.body.id).toBeDefined();
    });

    it('GET /products should return all products', async () => {
        const product = await createTestProduct();

        const response = await request(app.getHttpServer())
            .get('/products')
            .expect(200);

        expect(response.body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                }),
            ]),
        );

        expect(response.body.meta).toMatchObject({
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
        });
    });

    it('GET /products/:id should return a product', async () => {
        const product = await createTestProduct();

        const response = await request(app.getHttpServer())
            .get(`/products/${product.id}`)
            .expect(200);

        expect(response.body).toMatchObject({
            id: product.id,
            name: product.name,
            price: product.price,
        });
    });

    it('PATCH /products/:id should update a product', async () => {
        const product = await createTestProduct();

        const response = await request(app.getHttpServer())
            .patch(`/products/${product.id}`)
            .send({
                price: 29.99,
            })
            .expect(200);

        expect(response.body).toMatchObject({
            id: product.id,
            name: product.name,
            price: 29.99,
        });
    });

    it('DELETE /products/:id should delete a product', async () => {
        const product = await createTestProduct();

        await request(app.getHttpServer())
            .delete(`/products/${product.id}`)
            .expect(200);

        await request(app.getHttpServer())
            .get(`/products/${product.id}`)
            .expect(404);
    });

    it('POST /products should reject invalid data', async () => {
        await request(app.getHttpServer())
            .post('/products')
            .send({
                name: '',
                price: -10,
            })
            .expect(400);
    });

    it('GET /products/:id should reject an invalid ID', async () => {
        await request(app.getHttpServer())
            .get('/products/not-a-number')
            .expect(400);
    });

    it('should serve cached reads and invalidate them on write', async () => {
        const product = await createTestProduct();

        await request(app.getHttpServer())
            .get(`/products/${product.id}`)
            .expect(200)
            .expect((response) => {
                expect(response.body.name).toBe(product.name);
            });

        // Change the row behind the cache: the next read should still be the
        // cached copy, which proves the request never reached Postgres.
        await prisma.product.update({
            where: { id: product.id },
            data: { name: 'Changed Behind The Cache' },
        });

        await request(app.getHttpServer())
            .get(`/products/${product.id}`)
            .expect(200)
            .expect((response) => {
                expect(response.body.name).toBe(product.name);
            });

        await request(app.getHttpServer())
            .patch(`/products/${product.id}`)
            .send({ name: 'Fresh Name' })
            .expect(200);

        await request(app.getHttpServer())
            .get(`/products/${product.id}`)
            .expect(200)
            .expect((response) => {
                expect(response.body.name).toBe('Fresh Name');
            });
    });
});