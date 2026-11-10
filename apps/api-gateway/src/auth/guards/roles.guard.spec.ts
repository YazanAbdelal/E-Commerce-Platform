import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@app/contracts';

import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

function createContext(user?: { role?: string }): ExecutionContext {
    return {
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({
            getRequest: () => ({ user }),
        }),
    } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
    let guard: RolesGuard;

    const mockReflector = {
        getAllAndOverride: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        guard = new RolesGuard(mockReflector as unknown as Reflector);
    });

    it('should allow routes that require no roles', () => {
        mockReflector.getAllAndOverride.mockReturnValue(undefined);

        expect(guard.canActivate(createContext({ role: UserRole.CUSTOMER }))).toBe(
            true,
        );
    });

    it('should allow routes with an empty role list', () => {
        mockReflector.getAllAndOverride.mockReturnValue([]);

        expect(guard.canActivate(createContext())).toBe(true);
    });

    it('should read the metadata for the handler and the class', () => {
        mockReflector.getAllAndOverride.mockReturnValue(undefined);

        guard.canActivate(createContext());

        expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
            ROLES_KEY,
            ['handler', 'class'],
        );
    });

    it('should allow a user whose role is required', () => {
        mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

        expect(guard.canActivate(createContext({ role: UserRole.ADMIN }))).toBe(
            true,
        );
    });

    it('should reject a user with an insufficient role', () => {
        mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

        expect(() =>
            guard.canActivate(createContext({ role: UserRole.CUSTOMER })),
        ).toThrow(ForbiddenException);
    });

    it('should reject a request with no authenticated user', () => {
        mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

        expect(() => guard.canActivate(createContext())).toThrow(
            'Insufficient permissions',
        );
    });

    it('should expose the role list through the decorator metadata key', () => {
        expect(ROLES_KEY).toBe('roles');
    });
});
