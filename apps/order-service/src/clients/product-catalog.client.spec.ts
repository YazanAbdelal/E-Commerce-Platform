import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { ProductCatalogClient } from './product-catalog.client.js';

describe('ProductCatalogClient (order-service)', () => {
    let client: ProductCatalogClient;
    const mockFetch = vi.fn();

    function jsonResponse(body: unknown, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
        delete process.env.PRODUCT_CATALOG_URL;

        client = new ProductCatalogClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.PRODUCT_CATALOG_URL;
    });

    it('should return a product by id', async () => {
        const product = { id: 42, name: 'Laptop', price: 1000 };
        mockFetch.mockResolvedValue(jsonResponse(product));

        await expect(client.findOne(42)).resolves.toEqual(product);

        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3001/products/42',
        );
    });

    it('should use PRODUCT_CATALOG_URL when it is configured', async () => {
        process.env.PRODUCT_CATALOG_URL = 'http://product-catalog-service:3001';
        const configuredClient = new ProductCatalogClient();
        mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));

        await configuredClient.findOne(1);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://product-catalog-service:3001/products/1',
        );
    });

    it('should preserve a downstream 404', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Product with ID 99 not found.' }, 404),
        );

        await expect(client.findOne(99)).rejects.toMatchObject({
            status: 404,
            response: { message: 'Product with ID 99 not found.' },
        });
    });

    it('should fall back to the status text when the error body is not JSON', async () => {
        mockFetch.mockResolvedValue(
            new Response('nope', { status: 400, statusText: 'Bad Request' }),
        );

        const error = await client
            .findOne(42)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(400);
        expect((error as HttpException).getResponse()).toBe('Bad Request');
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(client.findOne(42)).rejects.toThrow(
            'Product Catalog Service returned an error',
        );
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client.findOne(42)).rejects.toThrow(BadGatewayException);
    });
});
