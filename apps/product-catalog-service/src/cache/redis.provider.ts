import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * The cache is optional by design: commands fail fast instead of queueing
 * while Redis is unreachable, so a cache outage costs latency, not requests.
 */
export function createRedisClient(): Redis {
    const logger = new Logger('RedisClient');

    const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    });

    client.on('error', (error: Error) => {
        logger.warn(`Redis error: ${error.message}`);
    });

    return client;
}
