import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { CartClient } from './cart.client.js';

describe('CartClient (order-service)', () => {
    let client: CartClient;
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
        delete process.env.SHOPPING_CART_URL;

        client = new CartClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.SHOPPING_CART_URL;
    });

    it('should return the cart and forward the bearer token', async () => {
        const cart = {
            id: 1,
            userId: 7,
            items: [{ productId: 42, quantity: 2 }],
        };
        mockFetch.mockResolvedValue(jsonResponse(cart));

        await expect(client.getCart('jwt-token')).resolves.toEqual(cart);

        expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3003/cart');
        expect(sentHeaders().get('authorization')).toBe('Bearer jwt-token');
    });

    it('should use SHOPPING_CART_URL when it is configured', async () => {
        process.env.SHOPPING_CART_URL = 'http://shopping-cart-service:3003';
        const configuredClient = new CartClient();
        mockFetch.mockResolvedValue(jsonResponse({ items: [] }));

        await configuredClient.getCart('jwt-token');

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://shopping-cart-service:3003/cart',
        );
    });

    it('should preserve downstream client errors', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Missing or invalid authorization token' }, 401),
        );

        await expect(client.getCart('jwt-token')).rejects.toMatchObject({
            status: 401,
            response: { message: 'Missing or invalid authorization token' },
        });
    });

    it('should fall back to the status text when the error body is not JSON', async () => {
        mockFetch.mockResolvedValue(
            new Response('nope', { status: 400, statusText: 'Bad Request' }),
        );

        const error = await client
            .getCart('jwt-token')
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(400);
        expect((error as HttpException).getResponse()).toBe('Bad Request');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(client.getCart('jwt-token')).rejects.toThrow(
            'Shopping Cart Service returned an error',
        );
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client.getCart('jwt-token')).rejects.toThrow(
            BadGatewayException,
        );
    });
});
