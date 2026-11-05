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
import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from './products.service.js';

describe('ProductsService (integration)', () => {
    let module: TestingModule;
    let prisma: PrismaService;
    let service: ProductsService;

    const createdProductIds: number[] = [];

    beforeAll(async () => {
        if (!process.env.TEST_DATABASE_URL) {
            throw new Error('TEST_DATABASE_URL is not defined');
        }

        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

        module = await Test.createTestingModule({
            providers: [ProductsService, PrismaService],
        }).compile();

        await module.init();

        prisma = module.get<PrismaService>(PrismaService);
        service = module.get<ProductsService>(ProductsService);
    });

    afterEach(async () => {
        // Remove products created during each test.
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
        await module.close();
    });

    async function createTestProduct() {
        const product = await service.create({
            name: `Integration Test ${Date.now()}-${Math.random()}`,
            price: 19.99,
        });

        createdProductIds.push(product.id);

        return product;
    }

    it('should create and retrieve a product', async () => {
        const created = await createTestProduct();

        expect(created.id).toBeDefined();
        expect(created.name).toContain('Integration Test');
        expect(created.price).toBe(19.99);

        const retrieved = await service.findOne(created.id);

        expect(retrieved).toEqual(created);
    });

    it('should return all products', async () => {
        const created = await createTestProduct();

        const products = await service.findAll({
            page: 1,
            limit: 10,
            sortBy: 'name',
            order: 'asc',
        });

        expect(products.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: created.id,
                    name: created.name,
                    price: created.price,
                }),
            ]),
        );
    });

    it('should update an existing product', async () => {
        const created = await createTestProduct();

        const updated = await service.update(created.id, {
            name: 'Updated Integration Product',
            price: 29.99,
        });

        expect(updated.id).toBe(created.id);
        expect(updated.name).toBe('Updated Integration Product');
        expect(updated.price).toBe(29.99);

        const retrieved = await service.findOne(created.id);

        expect(retrieved).toEqual(updated);
    });

    it('should delete an existing product', async () => {
        const created = await createTestProduct();

        await service.remove(created.id);

        const deleted = await prisma.product.findUnique({
            where: { id: created.id },
        });

        expect(deleted).toBeNull();
    });

    it('should throw NotFoundException for a nonexistent product', async () => {
        await expect(service.findOne(999999999)).rejects.toThrow(
            NotFoundException,
        );
    });
});