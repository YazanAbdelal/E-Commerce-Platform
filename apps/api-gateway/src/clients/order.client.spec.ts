import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { OrderClient } from './order.client.js';

describe('OrderClient', () => {
    const authorization = 'Bearer test-token';
    const requestId = 'req-456';

    let client: OrderClient;
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
        delete process.env.ORDER_SERVICE_URL;

        client = new OrderClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.ORDER_SERVICE_URL;
    });

    it('should create an order with a POST and forward headers', async () => {
        const order = { id: 1, userId: 7, status: 'PENDING' };
        mockFetch.mockResolvedValue(jsonResponse(order));

        await expect(
            client.createOrder(authorization, requestId),
        ).resolves.toEqual(order);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3004/orders');
        expect(init.method).toBe('POST');
        expect(sentHeaders().get('authorization')).toBe(authorization);
        expect(sentHeaders().get('x-request-id')).toBe(requestId);
    });

    it('should list orders', async () => {
        const orders = [{ id: 1 }, { id: 2 }];
        mockFetch.mockResolvedValue(jsonResponse(orders));

        await expect(
            client.getOrders(authorization, requestId),
        ).resolves.toEqual(orders);

        expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:3004/orders');
        expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBeUndefined();
    });

    it('should fetch a single order by id', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 12 }));

        await expect(
            client.getOrder(authorization, requestId, 12),
        ).resolves.toEqual({ id: 12 });

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3004/orders/12',
        );
    });

    it('should preserve downstream client errors', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Order not found' }, 404),
        );

        await expect(
            client.getOrder(authorization, requestId, 99),
        ).rejects.toMatchObject({
            status: 404,
            response: { message: 'Order not found' },
        });
    });

    it('should fall back to the status text when the error body is not JSON', async () => {
        mockFetch.mockResolvedValue(
            new Response('nope', { status: 403, statusText: 'Forbidden' }),
        );

        const error = await client
            .getOrders(authorization, requestId)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(403);
        expect((error as HttpException).getResponse()).toBe('Forbidden');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 503 }));

        await expect(
            client.getOrders(authorization, requestId),
        ).rejects.toThrow('Order Service returned an error');
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
            client.createOrder(authorization, requestId),
        ).rejects.toThrow(BadGatewayException);
    });

    it('should use ORDER_SERVICE_URL when it is configured', async () => {
        process.env.ORDER_SERVICE_URL = 'http://order-service:3004';
        const configuredClient = new OrderClient();
        mockFetch.mockResolvedValue(jsonResponse([]));

        await configuredClient.getOrders(authorization, requestId);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://order-service:3004/orders',
        );
    });
});
