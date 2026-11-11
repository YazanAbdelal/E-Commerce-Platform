import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { Counter } from '@prometheus-io/client';

import { ProductsCacheService } from './products-cache.service.js';
import type { FindProductsQueryDto } from '../products/dto/find-products-query.dto.js';

const query = {
    page: 1,
    limit: 10,
    sortBy: 'name',
    order: 'asc',
} as FindProductsQueryDto;

interface FakeRedis {
    store: Map<string, string>;
    client: Redis;
}

function createRedis(): FakeRedis {
    const store = new Map<string, string>();

    const client = {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
            return 'OK';
        }),
        multi: vi.fn(() => {
            const operations: Array<() => void> = [];

            const transaction = {
                del: vi.fn((key: string) => {
                    operations.push(() => store.delete(key));
                    return transaction;
                }),
                incr: vi.fn((key: string) => {
                    operations.push(() =>
                        store.set(key, String(Number(store.get(key) ?? 0) + 1)),
                    );
                    return transaction;
                }),
                exec: vi.fn(async () => {
                    for (const operation of operations) {
                        operation();
                    }
                    return [];
                }),
            };

            return transaction;
        }),
    };

    return { store, client: client as unknown as Redis };
}

function createCounter() {
    return { inc: vi.fn() } as unknown as Counter<string>;
}

describe('ProductsCacheService', () => {
    let redis: FakeRedis;
    let hits: Counter<string>;
    let misses: Counter<string>;
    let errors: Counter<string>;
    let service: ProductsCacheService;

    beforeEach(() => {
        redis = createRedis();
        hits = createCounter();
        misses = createCounter();
        errors = createCounter();

        service = new ProductsCacheService(
            redis.client,
            hits,
            misses,
            errors,
        );
    });

    describe('product detail', () => {
        it('should miss and count it when the key is absent', async () => {
            await expect(service.getProduct(1)).resolves.toBeNull();
            expect(misses.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
            expect(hits.inc).not.toHaveBeenCalled();
        });

        it('should return a parsed product on a hit', async () => {
            const product = { id: 1, name: 'Laptop', price: 1200 };
            redis.store.set('catalog:product:1', JSON.stringify(product));

            await expect(service.getProduct(1)).resolves.toEqual(product);
            expect(hits.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });

        it('should store a product with the configured TTL', async () => {
            const product = { id: 7, name: 'Mouse', price: 25 };

            await service.setProduct(product);

            expect(redis.client.set).toHaveBeenCalledWith(
                'catalog:product:7',
                JSON.stringify(product),
                'EX',
                60,
            );
        });

        it('should treat unreadable payloads as a miss', async () => {
            redis.store.set('catalog:product:1', 'not-json');

            await expect(service.getProduct(1)).resolves.toBeNull();
            expect(errors.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });

        it('should degrade to a miss when Redis cannot be read', async () => {
            vi.mocked(redis.client.get).mockRejectedValueOnce(
                new Error('connection is closed'),
            );

            await expect(service.getProduct(1)).resolves.toBeNull();
            expect(errors.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });

        it('should swallow write failures', async () => {
            vi.mocked(redis.client.set).mockRejectedValueOnce(
                new Error('connection is closed'),
            );

            await expect(
                service.setProduct({ id: 1, name: 'Laptop', price: 1200 }),
            ).resolves.toBeUndefined();
            expect(errors.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });
    });

    describe('product lists', () => {
        const result = {
            data: [{ id: 1, name: 'Laptop', price: 1200 }],
            meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        };

        it('should cache a list and serve it back on the same query', async () => {
            await service.setList(query, result);

            await expect(service.getList(query)).resolves.toEqual(result);
            expect(hits.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });

        it('should keep different queries on different keys', async () => {
            await service.setList(query, result);

            await expect(
                service.getList({ ...query, page: 2 }),
            ).resolves.toBeNull();
        });

        it('should store lists with the list TTL', async () => {
            await service.setList(query, result);

            expect(redis.client.set).toHaveBeenCalledWith(
                expect.stringContaining('catalog:products:0:'),
                JSON.stringify(result),
                'EX',
                30,
            );
        });

        it('should treat an unreadable payload as a miss', async () => {
            await service.setList(query, result);
            const [key] = vi.mocked(redis.client.set).mock.calls[0] as [
                string,
                string,
            ];
            redis.store.set(key, '{broken');

            await expect(service.getList(query)).resolves.toBeNull();
            expect(errors.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });

        it('should skip the cache when the version cannot be read', async () => {
            vi.mocked(redis.client.get).mockRejectedValueOnce(
                new Error('connection is closed'),
            );

            await expect(service.getList(query)).resolves.toBeNull();
        });

        it('should not write a list when the version cannot be read', async () => {
            vi.mocked(redis.client.get).mockRejectedValueOnce(
                new Error('connection is closed'),
            );

            await service.setList(query, result);

            expect(redis.client.set).not.toHaveBeenCalled();
        });
    });

    describe('invalidation', () => {
        it('should retire the detail key and every cached list on update', async () => {
            await service.setProduct({ id: 1, name: 'Laptop', price: 1200 });
            await service.setList(query, {
                data: [],
                meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
            });

            await service.invalidate(1);

            expect(redis.store.has('catalog:product:1')).toBe(false);
            await expect(service.getList(query)).resolves.toBeNull();
        });

        it('should only bump the list version on create', async () => {
            await service.setList(query, {
                data: [],
                meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
            });

            await service.invalidate();

            expect(redis.store.get('catalog:products:version')).toBe('1');
            await expect(service.getList(query)).resolves.toBeNull();
        });

        it('should log and continue when Redis rejects the transaction', async () => {
            vi.mocked(redis.client.multi).mockImplementationOnce(() => {
                throw new Error('connection is closed');
            });

            await expect(service.invalidate(1)).resolves.toBeUndefined();
            expect(errors.inc).toHaveBeenCalledWith({ cache: 'product-catalog' });
        });
    });
});
