import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard.js';

function createContext(request: Record<string, unknown>): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
    } as unknown as ExecutionContext;
}

describe('JwtAuthGuard (api-gateway)', () => {
    let guard: JwtAuthGuard;

    const mockJwtService = {
        verifyAsync: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        guard = new JwtAuthGuard(
            mockJwtService as unknown as JwtService,
        );
    });

    it('should reject a request without an authorization header', async () => {
        const context = createContext({ headers: {} });

        await expect(guard.canActivate(context)).rejects.toThrow(
            'Missing or invalid authorization token',
        );
    });

    it('should reject a non-Bearer scheme', async () => {
        const context = createContext({
            headers: { authorization: 'Basic abc123' },
        });

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('should reject a Bearer header with no token', async () => {
        const context = createContext({
            headers: { authorization: 'Bearer ' },
        });

        await expect(guard.canActivate(context)).rejects.toThrow(
            'Missing or invalid authorization token',
        );
    });

    it('should reject an invalid or expired token', async () => {
        mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
        const context = createContext({
            headers: { authorization: 'Bearer expired-token' },
        });

        await expect(guard.canActivate(context)).rejects.toThrow(
            'Invalid or expired token',
        );
    });

    it.each([0, -1, 1.5, Number.NaN])(
        'should reject a token whose subject is %s',
        async (sub) => {
            mockJwtService.verifyAsync.mockResolvedValue({ sub });
            const context = createContext({
                headers: { authorization: 'Bearer bad-subject' },
            });

            await expect(guard.canActivate(context)).rejects.toThrow(
                'Invalid or expired token',
            );
        },
    );

    it('should attach the payload to the request and allow the call', async () => {
        const payload = { sub: 7, email: 'a@b.com', role: 'CUSTOMER' };
        mockJwtService.verifyAsync.mockResolvedValue(payload);
        const request: Record<string, unknown> = {
            headers: { authorization: 'Bearer valid-token' },
        };

        await expect(
            guard.canActivate(createContext(request)),
        ).resolves.toBe(true);

        expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
        expect(request.user).toEqual(payload);
    });
});
