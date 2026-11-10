import { afterEach, describe, expect, it, vi } from 'vitest';

const { create, listen, useLogger, useGlobalPipes, get } = vi.hoisted(() => ({
    create: vi.fn(),
    listen: vi.fn(),
    useLogger: vi.fn(),
    useGlobalPipes: vi.fn(),
    get: vi.fn(),
}));

vi.mock('@nestjs/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nestjs/core')>();

    return { ...actual, NestFactory: { create } };
});

describe('product-catalog-service bootstrap', () => {
    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        delete process.env.PORT;
    });

    function primeApplicationFactory() {
        create.mockResolvedValue({ listen, useLogger, useGlobalPipes, get });
    }

    it('should start the service on the configured port', async () => {
        primeApplicationFactory();
        process.env.PORT = '3555';

        await import('./main.js');

        expect(create).toHaveBeenCalledOnce();
        expect(useLogger).toHaveBeenCalledOnce();
        expect(useGlobalPipes).toHaveBeenCalledOnce();
        expect(listen).toHaveBeenCalledWith('3555');
    });

    it('should fall back to the default port', async () => {
        primeApplicationFactory();

        await import('./main.js');

        expect(listen).toHaveBeenCalledWith(3001);
    });
});
