import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from './redis.provider.js';

@Injectable()
export class RedisLifecycle implements OnApplicationShutdown {
    constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

    async onApplicationShutdown(): Promise<void> {
        if (this.client.status === 'end') {
            return;
        }

        try {
            await this.client.quit();
        } catch {
            this.client.disconnect();
        }
    }
}
