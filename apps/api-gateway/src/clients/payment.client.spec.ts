import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { PaymentClient } from './payment.client.js';

describe('PaymentClient', () => {
    const authorization = 'Bearer test-token';
    const requestId = 'req-789';

    let client: PaymentClient;
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
        delete process.env.PAYMENT_SERVICE_URL;

        client = new PaymentClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.PAYMENT_SERVICE_URL;
    });

    it('should create a payment for an order', async () => {
        const payment = { id: 5, orderId: 1, status: 'PENDING' };
        mockFetch.mockResolvedValue(jsonResponse(payment));

        await expect(
            client.createPayment(authorization, requestId, 1),
        ).resolves.toEqual(payment);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3005/payments');
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ orderId: 1 }));
        expect(sentHeaders().get('content-type')).toBe('application/json');
        expect(sentHeaders().get('idempotency-key')).toBeNull();
    });

    it('should forward an idempotency key when one is provided', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 5 }));

        await client.createPayment(authorization, requestId, 1, 'checkout-1');

        expect(sentHeaders().get('idempotency-key')).toBe('checkout-1');
        expect(sentHeaders().get('authorization')).toBe(authorization);
        expect(sentHeaders().get('x-request-id')).toBe(requestId);
    });

    it('should list payments', async () => {
        mockFetch.mockResolvedValue(jsonResponse([{ id: 1 }]));

        await expect(
            client.getPayments(authorization, requestId),
        ).resolves.toEqual([{ id: 1 }]);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3005/payments',
        );
    });

    it('should fetch a single payment', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 5 }));

        await expect(
            client.getPayment(authorization, requestId, 5),
        ).resolves.toEqual({ id: 5 });

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3005/payments/5',
        );
    });

    it('should capture a payment with a POST', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 5, status: 'COMPLETED' }));

        await expect(
            client.capturePayment(authorization, requestId, 5),
        ).resolves.toMatchObject({ status: 'COMPLETED' });

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3005/payments/5/capture');
        expect(init.method).toBe('POST');
    });

    it('should refund a payment with a POST', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 5, status: 'REFUNDED' }));

        await expect(
            client.refundPayment(authorization, requestId, 5),
        ).resolves.toMatchObject({ status: 'REFUNDED' });

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3005/payments/5/refund',
        );
    });

    it('should preserve a 409 from a reused idempotency key', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse(
                { message: 'Idempotency key was already used for a different payment' },
                409,
            ),
        );

        await expect(
            client.createPayment(authorization, requestId, 1, 'reused'),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                message:
                    'Idempotency key was already used for a different payment',
            },
        });
    });

    it('should fall back to the status text for non-JSON client errors', async () => {
        mockFetch.mockResolvedValue(
            new Response('nope', { status: 400, statusText: 'Bad Request' }),
        );

        const error = await client
            .capturePayment(authorization, requestId, 5)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(400);
        expect((error as HttpException).getResponse()).toBe('Bad Request');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(
            client.getPayments(authorization, requestId),
        ).rejects.toThrow('Payment Service returned an error');
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
            client.getPayments(authorization, requestId),
        ).rejects.toThrow(BadGatewayException);
    });

    it('should use PAYMENT_SERVICE_URL when it is configured', async () => {
        process.env.PAYMENT_SERVICE_URL = 'http://payment-service:3005';
        const configuredClient = new PaymentClient();
        mockFetch.mockResolvedValue(jsonResponse([]));

        await configuredClient.getPayments(authorization, requestId);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://payment-service:3005/payments',
        );
    });
});
