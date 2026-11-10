import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { PaymentsController } from './payments.controller.js';
import { PaymentClient } from '../clients/payment.client.js';

function createRequest(): Request {
    return {
        id: 'req-payment',
        headers: { authorization: 'Bearer test-token' },
    } as unknown as Request;
}

describe('PaymentsController (api-gateway)', () => {
    let controller: PaymentsController;

    const mockPaymentClient = {
        createPayment: vi.fn(),
        getPayments: vi.fn(),
        getPayment: vi.fn(),
        capturePayment: vi.fn(),
        refundPayment: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        controller = new PaymentsController(
            mockPaymentClient as unknown as PaymentClient,
        );
    });

    it('should proxy payment creation without an idempotency key', async () => {
        await controller.createPayment(createRequest(), { orderId: 1 });

        expect(mockPaymentClient.createPayment).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-payment',
            1,
            undefined,
        );
    });

    it('should forward the idempotency key header', async () => {
        await controller.createPayment(
            createRequest(),
            { orderId: 1 },
            'checkout-1',
        );

        expect(mockPaymentClient.createPayment).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-payment',
            1,
            'checkout-1',
        );
    });

    it('should proxy listing payments', async () => {
        await controller.getPayments(createRequest());

        expect(mockPaymentClient.getPayments).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-payment',
        );
    });

    it('should proxy reading one payment', async () => {
        await controller.getPayment(createRequest(), 5);

        expect(mockPaymentClient.getPayment).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-payment',
            5,
        );
    });

    it('should proxy capture', async () => {
        await controller.capturePayment(createRequest(), 5);

        expect(mockPaymentClient.capturePayment).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-payment',
            5,
        );
    });

    it('should proxy refund', async () => {
        await controller.refundPayment(createRequest(), 5);

        expect(mockPaymentClient.refundPayment).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-payment',
            5,
        );
    });
});
