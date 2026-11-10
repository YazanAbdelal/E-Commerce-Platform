import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { ProductsController } from './products.controller.js';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';

function createRequest(): Request {
    return { id: 'req-product' } as unknown as Request;
}

describe('ProductsController (api-gateway)', () => {
    let controller: ProductsController;

    const mockProductCatalogClient = {
        findAll: vi.fn(),
        findOne: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
        controller = new ProductsController(
            mockProductCatalogClient as unknown as ProductCatalogClient,
        );
    });

    it('should forward list filters and the request id', async () => {
        await controller.findAll({ page: '2', search: 'lap' }, createRequest());

        expect(mockProductCatalogClient.findAll).toHaveBeenCalledWith(
            { page: '2', search: 'lap' },
            'req-product',
        );
    });

    it('should convert the path id to a number when reading one product', async () => {
        await controller.findOne('42', createRequest());

        expect(mockProductCatalogClient.findOne).toHaveBeenCalledWith(
            42,
            'req-product',
        );
    });

    it('should proxy product creation', async () => {
        const body = { name: 'Laptop', price: 1000 };

        await controller.create(body, createRequest());

        expect(mockProductCatalogClient.create).toHaveBeenCalledWith(
            body,
            'req-product',
        );
    });

    it('should keep the raw id string when updating', async () => {
        const body = { price: 900 };

        await controller.update('42', body, createRequest());

        expect(mockProductCatalogClient.update).toHaveBeenCalledWith(
            '42',
            body,
            'req-product',
        );
    });

    it('should proxy product deletion', async () => {
        await controller.remove('42', createRequest());

        expect(mockProductCatalogClient.remove).toHaveBeenCalledWith(
            '42',
            'req-product',
        );
    });
});
