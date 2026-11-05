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

import { ProductCatalogServiceModule } from '../src/product-catalog-service.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Products (E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        if (!process.env.TEST_DATABASE_URL) {
            throw new Error('TEST_DATABASE_URL is not defined');
        }

        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

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

        await app.init();
    });

    afterEach(async () => {
        // The test database is dedicated to testing.
        await prisma.product.deleteMany();
    });

    afterAll(async () => {
        await app.close();
    });

    async function createTestProduct() {
        return prisma.product.create({
            data: {
                name: 'E2E Test Product',
                price: 19.99,
            },
        });
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

        expect(response.body.id).toBeDefined();
    });

    it('GET /products should return all products', async () => {
        const product = await createTestProduct();

        const response = await request(app.getHttpServer())
            .get('/products')
            .expect(200);

        expect(response.body).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                }),
            ]),
        );
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
});