import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BadGatewayException,
    HttpException,
} from '@nestjs/common';

import { ProductCatalogClient } from './product-catalog.client.js';

describe('ProductCatalogClient', () => {
    let client: ProductCatalogClient;
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);

        client = new ProductCatalogClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should return a product when the request succeeds', async () => {
        const product = {
            id: 42,
            name: 'Test Product',
            price: 99.99,
        };

        mockFetch.mockResolvedValue(
            new Response(JSON.stringify(product), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(client.findOne(42)).resolves.toEqual(product);

        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3001/products/42',
            {},
        );
    });

    it('should preserve a 404 response from the Product Catalog Service', async () => {
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({ message: 'Product not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(client.findOne(999)).rejects.toMatchObject({
            status: 404,
        });
    });

    it('should throw BadGatewayException when the service is unavailable', async () => {
        mockFetch.mockRejectedValue(new Error('Connection refused'));

        await expect(client.findOne(42)).rejects.toThrow(
            BadGatewayException,
        );
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(
            new Response('Internal Server Error', {
                status: 500,
            }),
        );

        await expect(client.findOne(42)).rejects.toThrow(
            BadGatewayException,
        );
    });
});