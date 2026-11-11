import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { RedisLifecycle } from './redis.lifecycle.js';

function createClient(status: string) {
    return {
        status,
        quit: vi.fn().mockResolvedValue('OK'),
        disconnect: vi.fn(),
    } as unknown as Redis;
}

describe('RedisLifecycle', () => {
    it('should close the connection on shutdown', async () => {
        const client = createClient('ready');

        await new RedisLifecycle(client).onApplicationShutdown();

        expect(client.quit).toHaveBeenCalledOnce();
    });

    it('should disconnect when a graceful quit fails', async () => {
        const client = createClient('ready');
        vi.mocked(client.quit).mockRejectedValueOnce(new Error('already gone'));

        await new RedisLifecycle(client).onApplicationShutdown();

        expect(client.disconnect).toHaveBeenCalledOnce();
    });

    it('should do nothing when the connection already ended', async () => {
        const client = createClient('end');

        await new RedisLifecycle(client).onApplicationShutdown();

        expect(client.quit).not.toHaveBeenCalled();
        expect(client.disconnect).not.toHaveBeenCalled();
    });
});
