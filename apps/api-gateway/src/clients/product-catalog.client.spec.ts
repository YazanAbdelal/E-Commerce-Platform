import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, HttpException } from '@nestjs/common';

import { ProductCatalogClient } from './product-catalog.client.js';

describe('ProductCatalogClient', () => {
    const requestId = 'req-catalog';

    let client: ProductCatalogClient;
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
        delete process.env.PRODUCT_CATALOG_URL;

        client = new ProductCatalogClient();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.PRODUCT_CATALOG_URL;
    });

    it('should list products without a query string', async () => {
        const page = {
            data: [{ id: 1, name: 'Laptop', price: 1000 }],
            meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        };
        mockFetch.mockResolvedValue(jsonResponse(page));

        await expect(client.findAll({}, requestId)).resolves.toEqual(page);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3001/products',
        );
        expect(sentHeaders().get('x-request-id')).toBe(requestId);
    });

    it('should drop undefined query parameters when building the query string', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ data: [], meta: {} }));

        await client.findAll(
            { search: 'lap', minPrice: undefined, page: '2' },
            requestId,
        );

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3001/products?search=lap&page=2',
        );
    });

    it('should fetch one product', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ id: 3, name: 'Mouse', price: 25 }),
        );

        await expect(client.findOne(3, requestId)).resolves.toMatchObject({
            id: 3,
        });

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://localhost:3001/products/3',
        );
    });

    it('should create a product', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ id: 9, name: 'Keyboard', price: 80 }, 201),
        );

        await client.create({ name: 'Keyboard', price: 80 }, requestId);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3001/products');
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ name: 'Keyboard', price: 80 }));
        expect(sentHeaders().get('content-type')).toBe('application/json');
    });

    it('should update a product using the raw id string', async () => {
        mockFetch.mockResolvedValue(jsonResponse({ id: 9 }));

        await client.update('9', { price: 70 }, requestId);

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3001/products/9');
        expect(init.method).toBe('PATCH');
        expect(init.body).toBe(JSON.stringify({ price: 70 }));
    });

    it('should delete a product', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Product deleted successfuly.' }),
        );

        await expect(client.remove('9', requestId)).resolves.toEqual({
            message: 'Product deleted successfuly.',
        });

        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

        expect(url).toBe('http://localhost:3001/products/9');
        expect(init.method).toBe('DELETE');
    });

    it('should preserve a downstream 404', async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({ message: 'Product with ID 99 not found.' }, 404),
        );

        await expect(client.findOne(99, requestId)).rejects.toMatchObject({
            status: 404,
            response: { message: 'Product with ID 99 not found.' },
        });
    });

    it('should fall back to status text when the error body is not JSON', async () => {
        mockFetch.mockResolvedValue(
            new Response('bad', { status: 422, statusText: 'Unprocessable Entity' }),
        );

        const error = await client
            .create({ name: '', price: -1 }, requestId)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(422);
        expect((error as HttpException).getResponse()).toBe(
            'Unprocessable Entity',
        );
    });

    it('should convert downstream server errors into 502', async () => {
        mockFetch.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(client.findOne(1, requestId)).rejects.toThrow(
            'Product Catalog Service returned an error',
        );
    });

    it('should throw BadGatewayException when the service is unreachable', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(client.findOne(1, requestId)).rejects.toThrow(
            BadGatewayException,
        );
    });

    it('should use PRODUCT_CATALOG_URL when it is configured', async () => {
        process.env.PRODUCT_CATALOG_URL = 'http://product-catalog:3001';
        const configuredClient = new ProductCatalogClient();
        mockFetch.mockResolvedValue(jsonResponse({ data: [], meta: {} }));

        await configuredClient.findAll({}, requestId);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'http://product-catalog:3001/products',
        );
    });
});
