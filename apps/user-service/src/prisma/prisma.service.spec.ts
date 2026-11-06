import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('User Service PrismaService', () => {
    let service: PrismaService;

    beforeEach(() => {
        vi.stubEnv(
            'USER_DATABASE_URL',
            'postgresql://test:test@localhost:5432/test_db',
        );

        service = new PrismaService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should connect when the module initializes', async () => {
        const connectSpy = vi
            .spyOn(service, '$connect')
            .mockResolvedValue(undefined);

        await service.onModuleInit();

        expect(connectSpy).toHaveBeenCalledOnce();
    });

    it('should disconnect when the module is destroyed', async () => {
        const disconnectSpy = vi
            .spyOn(service, '$disconnect')
            .mockResolvedValue(undefined);

        await service.onModuleDestroy();

        expect(disconnectSpy).toHaveBeenCalledOnce();
    });

    it('should propagate connection errors', async () => {
        const error = new Error('Connection failed');

        vi.spyOn(service, '$connect').mockRejectedValue(error);

        await expect(service.onModuleInit()).rejects.toThrow(error);
    });

    it('should propagate disconnection errors', async () => {
        const error = new Error('Disconnection failed');

        vi.spyOn(service, '$disconnect').mockRejectedValue(error);

        await expect(service.onModuleDestroy()).rejects.toThrow(error);
    });
});