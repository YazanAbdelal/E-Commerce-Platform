import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@app/contracts';

import { UsersController } from './users.controller.js';
import { UserClient } from '../clients/user.client.js';

function createRequest(user?: { sub: number; role: string }) {
    return {
        id: 'req-users',
        user,
    } as never;
}

describe('UsersController (api-gateway)', () => {
    let controller: UsersController;

    const mockUserClient = {
        register: vi.fn(),
        findOne: vi.fn(),
        updateOne: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        controller = new UsersController(
            mockUserClient as unknown as UserClient,
        );
    });

    it('should register a user with the request id', async () => {
        const body = { email: 'a@b.com', password: 'password123' };

        await controller.register(body, createRequest());

        expect(mockUserClient.register).toHaveBeenCalledWith(body, 'req-users');
    });

    it('should allow a user to read their own record', async () => {
        await controller.findOne('7', createRequest({ sub: 7, role: 'CUSTOMER' }));

        expect(mockUserClient.findOne).toHaveBeenCalledWith(7, 'req-users');
    });

    it('should allow an admin to read any record', async () => {
        await controller.findOne(
            '9',
            createRequest({ sub: 7, role: UserRole.ADMIN }),
        );

        expect(mockUserClient.findOne).toHaveBeenCalledWith(9, 'req-users');
    });

    it('should forbid reading another user record', () => {
        expect(() =>
            controller.findOne('9', createRequest({ sub: 7, role: 'CUSTOMER' })),
        ).toThrow(ForbiddenException);
        expect(mockUserClient.findOne).not.toHaveBeenCalled();
    });

    it('should always update the authenticated user', async () => {
        const body = { email: 'new@b.com' };

        await controller.updateMe(body, createRequest({ sub: 7, role: 'CUSTOMER' }));

        expect(mockUserClient.updateOne).toHaveBeenCalledWith(
            7,
            body,
            'req-users',
        );
    });
});
