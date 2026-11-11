import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Redis } from 'ioredis';
import type { Counter } from '@prometheus-io/client';
import type { PaginatedResponse, Product } from '@app/contracts';
import {
    CACHE_ERRORS_TOTAL,
    CACHE_HITS_TOTAL,
    CACHE_MISSES_TOTAL,
} from '@app/observability';

import { REDIS_CLIENT } from './redis.provider.js';
import type { FindProductsQueryDto } from '../products/dto/find-products-query.dto.js';

const PRODUCT_KEY = 'catalog:product:';
const LIST_KEY = 'catalog:products:';
const LIST_VERSION_KEY = 'catalog:products:version';
const CACHE_LABEL = 'product-catalog';

/**
 * Cache-aside for catalog reads.
 *
 * Details live under `catalog:product:{id}`, lists under a key that embeds a
 * version counter. Any write deletes the affected detail key and bumps the
 * version, which retires every cached list at once without scanning for keys;
 * the TTLs are only a safety net for entries nobody invalidates.
 */
@Injectable()
export class ProductsCacheService {
    private readonly logger = new Logger(ProductsCacheService.name);

    private readonly productTtl = Number(
        process.env.PRODUCT_CACHE_TTL_SECONDS ?? 60,
    );
    private readonly listTtl = Number(
        process.env.PRODUCT_LIST_CACHE_TTL_SECONDS ?? 30,
    );

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: Redis,
        @InjectMetric(CACHE_HITS_TOTAL) private readonly hits: Counter<string>,
        @InjectMetric(CACHE_MISSES_TOTAL)
        private readonly misses: Counter<string>,
        @InjectMetric(CACHE_ERRORS_TOTAL)
        private readonly errors: Counter<string>,
    ) {}

    async getProduct(id: number): Promise<Product | null> {
        const payload = await this.read(`${PRODUCT_KEY}${id}`, 'getProduct');

        return payload === null ? null : this.parse<Product>(payload, 'getProduct');
    }

    async setProduct(product: Product): Promise<void> {
        await this.write(
            `${PRODUCT_KEY}${product.id}`,
            JSON.stringify(product),
            this.productTtl,
            'setProduct',
        );
    }

    async getList(
        query: FindProductsQueryDto,
    ): Promise<PaginatedResponse<Product> | null> {
        const key = await this.listKey(query);

        if (key === null) {
            return null;
        }

        const payload = await this.read(key, 'getList');

        return payload === null
            ? null
            : this.parse<PaginatedResponse<Product>>(payload, 'getList');
    }

    async setList(
        query: FindProductsQueryDto,
        result: PaginatedResponse<Product>,
    ): Promise<void> {
        const key = await this.listKey(query);

        if (key === null) {
            return;
        }

        await this.write(key, JSON.stringify(result), this.listTtl, 'setList');
    }

    /**
     * Called after every mutation. `productId` is omitted on create, where no
     * detail key can be stale but every cached list is.
     */
    async invalidate(productId?: number): Promise<void> {
        try {
            const transaction = this.redis.multi();

            if (productId !== undefined) {
                transaction.del(`${PRODUCT_KEY}${productId}`);
            }

            transaction.incr(LIST_VERSION_KEY);

            await transaction.exec();
        } catch (error) {
            this.recordError('invalidate', error);
        }
    }

    private async listKey(query: FindProductsQueryDto): Promise<string | null> {
        try {
            const version = (await this.redis.get(LIST_VERSION_KEY)) ?? '0';

            return `${LIST_KEY}${version}:${this.fingerprint(query)}`;
        } catch (error) {
            this.recordError('getListVersion', error);

            return null;
        }
    }

    private fingerprint(query: FindProductsQueryDto): string {
        const entries = Object.entries(query).sort(([left], [right]) =>
            left.localeCompare(right),
        );

        return createHash('sha256')
            .update(JSON.stringify(entries))
            .digest('hex')
            .slice(0, 16);
    }

    private async read(key: string, operation: string): Promise<string | null> {
        try {
            const value = await this.redis.get(key);

            if (value === null) {
                this.misses.inc({ cache: CACHE_LABEL });
            } else {
                this.hits.inc({ cache: CACHE_LABEL });
            }

            return value;
        } catch (error) {
            this.recordError(operation, error);

            return null;
        }
    }

    private async write(
        key: string,
        value: string,
        ttlSeconds: number,
        operation: string,
    ): Promise<void> {
        try {
            await this.redis.set(key, value, 'EX', ttlSeconds);
        } catch (error) {
            this.recordError(operation, error);
        }
    }

    private parse<T>(payload: string, operation: string): T | null {
        try {
            return JSON.parse(payload) as T;
        } catch (error) {
            this.recordError(operation, error);

            return null;
        }
    }

    private recordError(operation: string, error: unknown): void {
        this.errors.inc({ cache: CACHE_LABEL });
        this.logger.warn(
            `Cache ${operation} failed: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}
