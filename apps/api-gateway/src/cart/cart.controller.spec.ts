import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { CartController } from './cart.controller.js';
import { CartClient } from '../clients/cart.client.js';

function createRequest(): Request {
    return {
        id: 'req-cart',
        headers: { authorization: 'Bearer test-token' },
    } as unknown as Request;
}

describe('CartController (api-gateway)', () => {
    let controller: CartController;

    const mockCartClient = {
        getCart: vi.fn(),
        addItem: vi.fn(),
        updateItem: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        mockCartClient.getCart.mockResolvedValue({ items: [] });
        controller = new CartController(
            mockCartClient as unknown as CartClient,
        );
    });

    it('should proxy the cart read with the caller authorization', async () => {
        await controller.getCart(createRequest());

        expect(mockCartClient.getCart).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-cart',
        );
    });

    it('should proxy adding an item', async () => {
        const data = { productId: 42, quantity: 2 };

        await controller.addItem(createRequest(), data);

        expect(mockCartClient.addItem).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-cart',
            data,
        );
    });

    it('should proxy updating an item quantity', async () => {
        await controller.updateItem(createRequest(), 42, { quantity: 5 });

        expect(mockCartClient.updateItem).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-cart',
            42,
            { quantity: 5 },
        );
    });

    it('should proxy removing an item', async () => {
        await controller.removeItem(createRequest(), 42);

        expect(mockCartClient.removeItem).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-cart',
            42,
        );
    });

    it('should proxy clearing the cart', async () => {
        await controller.clearCart(createRequest());

        expect(mockCartClient.clearCart).toHaveBeenCalledWith(
            'Bearer test-token',
            'req-cart',
        );
    });

    it('should propagate client errors unchanged', async () => {
        const error = new Error('downstream failed');
        mockCartClient.getCart.mockRejectedValue(error);

        await expect(controller.getCart(createRequest())).rejects.toBe(error);
    });
});
