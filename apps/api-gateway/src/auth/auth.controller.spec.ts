import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import { UserClient } from '../clients/user.client.js';

describe('AuthController (api-gateway)', () => {
    let controller: AuthController;

    const mockUserClient = {
        login: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        controller = new AuthController(
            mockUserClient as unknown as UserClient,
        );
    });

    it('should forward the login body and the request id', async () => {
        const request = { id: 'req-1' } as never;
        const body = { email: 'a@b.com', password: 'password123' };
        mockUserClient.login.mockResolvedValue({ access_token: 'jwt' });

        await expect(controller.login(body, request)).resolves.toEqual({
            access_token: 'jwt',
        });
        expect(mockUserClient.login).toHaveBeenCalledWith(body, 'req-1');
    });

    it('should return the decoded user for the profile route', () => {
        const user = { sub: 7, email: 'a@b.com', role: 'CUSTOMER' };

        expect(controller.getProfile({ user })).toBe(user);
    });
});
