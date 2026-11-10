import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { OrderClient } from './order.client.js';

describe('OrderClient (payment-service)', () => {
    const authorization = 'Bearer customer-token';

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

    it('should read an order with the caller authorization', async () => {
        const order = {
            id: 10,
            userId: 7,
            totalAmount: '99.99',
            status: 'PENDING',
        };
        mockFetch.mockResolvedValue(jsonResponse(order));

        await expect(client.getOrder(10, authorization)).resolves.toEqual(order);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3004/orders/10',
        );
        expect(sentHeaders().get('authorization')).toBe(authorization);
    });

    it('should patch the order status with a JSON body', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 10, status: 'CONFIRMED' }));

        await expect(
            client.updateOrderStatus(10, authorization, 'CONFIRMED'),
        ).resolves.toMatchObject({ status: 'CONFIRMED' });

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3004/orders/10/status');
        expect(init.method).toBe('PATCH');
        expect(init.body).toBe(JSON.stringify({ status: 'CONFIRMED' }));
        expect(sentHeaders().get('content-type')).toBe('application/json');
        expect(sentHeaders().get('authorization')).toBe(authorization);
    });

    it('should use ORDER_SERVICE_URL when it is configured', async () => {
        process.env.ORDER_SERVICE_URL = 'http://order-service:3004';
        const configuredClient = new OrderClient();
        mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));

        await configuredClient.getOrder(1, authorization);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://order-service:3004/orders/1',
        );
    });

    it('should preserve a downstream 404 for a foreign order', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Order not found' }, 404),
        );

        await expect(client.getOrder(99, authorization)).rejects.toMatchObject({
            status: 404,
            response: { message: 'Order not found' },
        });
    });

    it('should fall back to the status text when the error body is not JSON', async () => {
        mockFetch.mockResolvedValue(
            new Response('nope', { status: 400, statusText: 'Bad Request' }),
        );

        const error = await client
            .updateOrderStatus(10, authorization, 'CANCELLED')
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(400);
        expect((error as HttpException).getResponse()).toBe('Bad Request');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(client.getOrder(10, authorization)).rejects.toThrow(
            'Order Service returned an error',
        );
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client.getOrder(10, authorization)).rejects.toThrow(
            BadGatewayException,
        );
    });
});
