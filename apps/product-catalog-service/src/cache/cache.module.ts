import { Module } from '@nestjs/common';
import { createCacheMetricsProviders } from '@app/observability';

import { ProductsCacheService } from './products-cache.service.js';
import { RedisLifecycle } from './redis.lifecycle.js';
import { REDIS_CLIENT, createRedisClient } from './redis.provider.js';

@Module({
    providers: [
        ...createCacheMetricsProviders(),
        { provide: REDIS_CLIENT, useFactory: createRedisClient },
        RedisLifecycle,
        ProductsCacheService,
    ],
    exports: [ProductsCacheService],
})
export class CacheModule {}
