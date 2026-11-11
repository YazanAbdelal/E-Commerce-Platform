import 'dotenv/config';

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from './products.service.js';
import { CacheModule } from '../cache/cache.module.js';
import { REDIS_CLIENT } from '../cache/redis.provider.js';

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

describe('ProductsService (integration)', () => {
    let module: TestingModule;
    let prisma: PrismaService;
    let service: ProductsService;
    let redis: Redis;

    const createdProductIds: number[] = [];

    beforeAll(async () => {
        if (!process.env.TEST_DATABASE_URL) {
            throw new Error('TEST_DATABASE_URL is not defined');
        }

        process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
        process.env.REDIS_URL =
            process.env.REDIS_TEST_URL ?? 'redis://localhost:6379/15';

        module = await Test.createTestingModule({
            imports: [CacheModule],
            providers: [ProductsService, PrismaService],
        }).compile();

        await module.init();

        prisma = module.get<PrismaService>(PrismaService);
        service = module.get<ProductsService>(ProductsService);
        redis = module.get<Redis>(REDIS_CLIENT);

        await waitForRedis(redis);
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

    describe('cache', () => {
        const query = {
            page: 1,
            limit: 10,
            sortBy: 'name' as const,
            order: 'asc' as const,
        };

        beforeEach(async () => {
            await redis.flushdb();
        });

        it('should populate Redis when a product is read', async () => {
            const created = await createTestProduct();

            await service.findOne(created.id);

            const key = `catalog:product:${created.id}`;

            expect(await redis.get(key)).not.toBeNull();
            expect(await redis.ttl(key)).toBeGreaterThan(0);
        });

        it('should drop the cached product when it is updated', async () => {
            const created = await createTestProduct();
            await service.findOne(created.id);

            await service.update(created.id, { price: 24.99 });

            expect(await redis.get(`catalog:product:${created.id}`)).toBeNull();
            await expect(service.findOne(created.id)).resolves.toMatchObject({
                price: 24.99,
            });
        });

        it('should cache list reads under the current version', async () => {
            await createTestProduct();

            await service.findAll(query);

            const version =
                (await redis.get('catalog:products:version')) ?? '0';
            const keys = await redis.keys(`catalog:products:${version}:*`);

            expect(keys.length).toBeGreaterThan(0);
        });

        it('should stop serving a cached list after a write', async () => {
            await service.findAll(query);

            const version =
                (await redis.get('catalog:products:version')) ?? '0';

            const created = await createTestProduct();

            const bumped =
                (await redis.get('catalog:products:version')) ?? '0';

            expect(bumped).not.toBe(version);

            const current = await service.findAll(query);
            const keys = await redis.keys(`catalog:products:${bumped}:*`);

            expect(current.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: created.id }),
                ]),
            );
            expect(keys.length).toBeGreaterThan(0);
        });
    });
});