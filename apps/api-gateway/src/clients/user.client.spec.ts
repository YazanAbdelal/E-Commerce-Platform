import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { UserClient } from './user.client.js';

describe('UserClient', () => {
    const requestId = 'req-user';

    let client: UserClient;
    const mockFetch = vi.fn();

    function jsonResponse(body: unknown, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    function sentHeaders(callIndex = 0) {
        const init = mockFetch.mock.calls[callIndex][1] as RequestInit;
        return new Headers(init.headers);
    }

    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
        delete process.env.USER_SERVICE_URL;

        client = new UserClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.USER_SERVICE_URL;
    });

    it('should register a user', async () => {
        const created = { id: 1, email: 'a@b.com', role: 'CUSTOMER' };
        mockFetch.mockResolvedValue(jsonResponse(created, 201));

        await expect(
            client.register({ email: 'a@b.com', password: 'password123' }, requestId),
        ).resolves.toEqual(created);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3002/users');
        expect(init.method).toBe('POST');
        expect(init.body).toBe(
            JSON.stringify({ email: 'a@b.com', password: 'password123' }),
        );
        expect(sentHeaders().get('content-type')).toBe('application/json');
        expect(sentHeaders().get('x-request-id')).toBe(requestId);
    });

    it('should log a user in', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ access_token: 'jwt.token.value' }),
        );

        await expect(
            client.login({ email: 'a@b.com', password: 'password123' }, requestId),
        ).resolves.toEqual({ access_token: 'jwt.token.value' });

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3002/auth/login',
        );
    });

    it('should fetch a single user', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 3 }));

        await expect(client.findOne(3, requestId)).resolves.toEqual({ id: 3 });

        expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3002/users/3');
    });

    it('should update a user', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 3, email: 'c@d.com' }));

        await client.updateOne(3, { email: 'c@d.com' }, requestId);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3002/users/3');
        expect(init.method).toBe('PATCH');
        expect(init.body).toBe(JSON.stringify({ email: 'c@d.com' }));
    });

    it('should preserve a 409 for a duplicate email', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Email is already registered' }, 409),
        );

        await expect(
            client.register({ email: 'a@b.com', password: 'password123' }, requestId),
        ).rejects.toMatchObject({
            status: 409,
            response: { message: 'Email is already registered' },
        });
    });

    it('should fall back to status text when the error body is not JSON', async () => {
        mockFetch.mockResolvedValue(
            new Response('nope', { status: 401, statusText: 'Unauthorized' }),
        );

        const error = await client
            .login({ email: 'a@b.com', password: 'wrong' }, requestId)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(401);
        expect((error as HttpException).getResponse()).toBe('Unauthorized');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(client.findOne(1, requestId)).rejects.toThrow(
            'User Service returned an error',
        );
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client.findOne(1, requestId)).rejects.toThrow(
            BadGatewayException,
        );
    });

    it('should use USER_SERVICE_URL when it is configured', async () => {
        process.env.USER_SERVICE_URL = 'http://user-service:3002';
        const configuredClient = new UserClient();
        mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));

        await configuredClient.findOne(1, requestId);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://user-service:3002/users/1',
        );
    });
});
