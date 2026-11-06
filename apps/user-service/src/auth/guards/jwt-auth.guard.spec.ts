import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
    let guard: JwtAuthGuard;
    let verifyAsync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        verifyAsync = vi.fn();

        const jwtService = {
            verifyAsync,
        } as unknown as JwtService;

        guard = new JwtAuthGuard(jwtService);
    });

    function createContext(authorization?: string) {
        const request: {
            headers: { authorization?: string };
            user?: unknown;
        } = {
            headers: {},
        };

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

        await expect(guard.canActivate(context))
            .rejects.toThrow(UnauthorizedException);
    });

    it('should reject authorization schemes other than Bearer', async () => {
        const { context } = createContext('Basic some-token');

        await expect(guard.canActivate(context))
            .rejects.toThrow(UnauthorizedException);
    });

    it('should reject a Bearer header without a token', async () => {
        const { context } = createContext('Bearer');

        await expect(guard.canActivate(context))
            .rejects.toThrow(UnauthorizedException);
    });

    it('should reject invalid or expired tokens', async () => {
        verifyAsync.mockRejectedValue(new Error('Invalid token'));

        const { context } = createContext('Bearer invalid-token');

        await expect(guard.canActivate(context))
            .rejects.toThrow('Invalid or expired token');

        expect(verifyAsync).toHaveBeenCalledWith('invalid-token');
    });

    it('should attach the verified JWT payload to request.user', async () => {
        const payload = {
            sub: 'user-123',
            email: 'test@example.com',
            role: 'USER',
        };

        verifyAsync.mockResolvedValue(payload);

        const { context, request } = createContext('Bearer valid-token');

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(verifyAsync).toHaveBeenCalledWith('valid-token');
        expect(request.user).toEqual(payload);
    });
});