import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { CartClient } from './cart.client.js';

describe('CartClient', () => {
    const authorization = 'Bearer test-token';
    const requestId = 'req-123';

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
        delete process.env.CART_SERVICE_URL;

        client = new CartClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.CART_SERVICE_URL;
    });

    it('should be defined', () => {
        expect(client).toBeDefined();
    });

    it('should return the cart and forward auth plus request id', async () => {
        const cart = { id: 1, userId: 7, items: [] };
        mockFetch.mockResolvedValue(jsonResponse(cart));

        await expect(client.getCart(authorization, requestId)).resolves.toEqual(
            cart,
        );

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3003/cart');
        expect(sentHeaders().get('authorization')).toBe(authorization);
        expect(sentHeaders().get('x-request-id')).toBe(requestId);
    });

    it('should POST a new item with a JSON body', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));

        await client.addItem(authorization, requestId, {
            productId: 42,
            quantity: 2,
        });

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3003/cart/items');
        expect(init.method).toBe('POST');
        expect(init.body).toBe(
            JSON.stringify({ productId: 42, quantity: 2 }),
        );
        expect(sentHeaders().get('content-type')).toBe('application/json');
    });

    it('should PATCH an item quantity', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ quantity: 5 }));

        await client.updateItem(authorization, requestId, 42, { quantity: 5 });

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3003/cart/items/42');
        expect(init.method).toBe('PATCH');
        expect(init.body).toBe(JSON.stringify({ quantity: 5 }));
    });

    it('should DELETE a single item', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ deleted: true }));

        await client.removeItem(authorization, requestId, 42);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3003/cart/items/42');
        expect(init.method).toBe('DELETE');
        expect(init.body).toBeUndefined();
    });

    it('should DELETE the whole cart', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ deletedItems: 3 }));

        await client.clearCart(authorization, requestId);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3003/cart');
        expect(init.method).toBe('DELETE');
    });

    it('should preserve a downstream client error payload and status', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Cart item not found' }, 404),
        );

        await expect(client.removeItem(authorization, requestId, 9)).rejects.toMatchObject(
            { status: 404, response: { message: 'Cart item not found' } },
        );
    });

    it('should fall back to the status text when a client error has no JSON body', async () => {
        mockFetch.mockResolvedValue(
            new Response('not-json', {
                status: 400,
                statusText: 'Bad Request',
            }),
        );

        const error = await client.getCart(authorization, requestId).catch(
            (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(400);
        expect((error as HttpException).getResponse()).toBe('Bad Request');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(client.getCart(authorization, requestId)).rejects.toThrow(
            BadGatewayException,
        );
        await expect(client.getCart(authorization, requestId)).rejects.toThrow(
            'Shopping Cart Service returned an error',
        );
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client.getCart(authorization, requestId)).rejects.toThrow(
            'Shopping Cart Service is unavailable',
        );
    });

    it('should use CART_SERVICE_URL when it is configured', async () => {
        process.env.CART_SERVICE_URL = 'http://cart-service:3003';
        const configuredClient = new CartClient();
        mockFetch.mockResolvedValue(jsonResponse({ items: [] }));

        await configuredClient.getCart(authorization, requestId);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://cart-service:3003/cart',
        );
    });
});
