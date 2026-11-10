import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard (shopping-cart-service)', () => {
    let guard: JwtAuthGuard;
    let verifyAsync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        verifyAsync = vi.fn();
        guard = new JwtAuthGuard({ verifyAsync } as unknown as JwtService);
    });

    function createContext(authorization?: string) {
        const request: {
            headers: { authorization?: string };
            user?: unknown;
        } = { headers: {} };

        if (authorization !== undefined) {
            request.headers.authorization = authorization;
        }

        const context = {
            switchToHttp: () => ({
                getRequest: () => request,
            }),
        } as ExecutionContext;

        return { context, request };
    }

    it('should reject requests without an Authorization header', async () => {
        const { context } = createContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('should reject authorization schemes other than Bearer', async () => {
        const { context } = createContext('Basic some-token');

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('should reject a Bearer header without a token', async () => {
        const { context } = createContext('Bearer');

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('should reject a token that fails verification', async () => {
        verifyAsync.mockRejectedValue(new Error('invalid token'));
        const { context } = createContext('Bearer bad-token');

        await expect(guard.canActivate(context)).rejects.toThrow(
            'Invalid or expired token',
        );
    });

    it('should reject a token with a non-positive subject', async () => {
        verifyAsync.mockResolvedValue({ sub: 1.5 });
        const { context } = createContext('Bearer bad-subject');

        await expect(guard.canActivate(context)).rejects.toThrow(
            'Invalid or expired token',
        );
    });

    it('should attach the payload and allow the request', async () => {
        const payload = { sub: 7 };
        verifyAsync.mockResolvedValue(payload);
        const { context, request } = createContext('Bearer valid-token');

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request.user).toEqual(payload);
    });
});
