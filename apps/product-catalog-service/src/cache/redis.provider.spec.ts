import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRedisClient } from './redis.provider.js';

const { RedisMock, instance } = vi.hoisted(() => {
    const instance = { on: vi.fn() };

    return {
        instance,
        RedisMock: vi.fn(function Redis() {
            return instance;
        }),
    };
});

vi.mock('ioredis', () => ({ Redis: RedisMock }));

describe('createRedisClient', () => {
    beforeEach(() => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        instance.on.mockClear();
        RedisMock.mockClear();
        delete process.env.REDIS_URL;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.REDIS_URL;
    });

    it('should connect to REDIS_URL', () => {
        process.env.REDIS_URL = 'redis://cache:6379/3';

        createRedisClient();

        expect(RedisMock).toHaveBeenCalledWith(
            'redis://cache:6379/3',
            expect.any(Object),
        );
    });

    it('should fall back to localhost', () => {
        createRedisClient();

        expect(RedisMock).toHaveBeenCalledWith(
            'redis://localhost:6379',
            expect.any(Object),
        );
    });

    it('should fail fast instead of queueing commands while disconnected', () => {
        createRedisClient();

        const [, options] = RedisMock.mock.calls[0];

        expect(options).toMatchObject({
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
        });
        expect(options.retryStrategy(1)).toBe(200);
        expect(options.retryStrategy(50)).toBe(2_000);
    });

    it('should log connection errors instead of crashing the process', () => {
        createRedisClient();

        const [event, handler] = instance.on.mock.calls[0];

        expect(event).toBe('error');
        expect(() => handler(new Error('ECONNREFUSED'))).not.toThrow();
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
            'Redis error: ECONNREFUSED',
        );
    });
});
