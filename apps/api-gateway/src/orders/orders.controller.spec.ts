import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { OrdersController } from './orders.controller.js';
import { OrderClient } from '../clients/order.client.js';

function createRequest(): Request {
    return {
        id: 'req-order',
        headers: { authorization: 'Bearer test-token' },
    } as unknown as Request;
}

describe('OrdersController (api-gateway)', () => {
    let controller: OrdersController;

    const mockOrderClient = {
        createOrder: vi.fn(),
        getOrders: vi.fn(),
        getOrder: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        controller = new OrdersController(
            mockOrderClient as unknown as OrderClient,
        );
    });

    it('should proxy order creation', async () => {
        await controller.createOrder(createRequest());

        expect(mockOrderClient.createOrder).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-order',
        );
    });

    it('should proxy listing orders', async () => {
        await controller.getOrders(createRequest());

        expect(mockOrderClient.getOrders).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-order',
        );
    });

    it('should proxy reading one order', async () => {
        await controller.getOrder(createRequest(), 12);

        expect(mockOrderClient.getOrder).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-order',
            12,
        );
    });

    it('should propagate client errors unchanged', async () => {
        const error = new Error('order service down');
        mockOrderClient.getOrders.mockRejectedValue(error);

        await expect(controller.getOrders(createRequest())).rejects.toBe(error);
    });
});
