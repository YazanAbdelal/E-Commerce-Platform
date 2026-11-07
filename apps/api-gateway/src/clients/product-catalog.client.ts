import { BadGatewayException, HttpException, Injectable, NotFoundException, Param } from '@nestjs/common';
import type { CreateProductRequest, PaginatedResponse, Product, UpdateProductRequest } from '@app/contracts';

@Injectable()
export class ProductCatalogClient {
    private readonly baseUrl = process.env.PRODUCT_CATALOG_URL ?? 'http://localhost:3001';

    async findAll(
        query: Record<string, string | undefined>, requestId: string,
    ): Promise<PaginatedResponse<Product>> {
        const queryString = new URLSearchParams(
            Object.entries(query).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
            ),
        ).toString();

        const path = queryString
            ? `/products?${queryString}`
            : '/products';

        const response = await this.sendRequest(path, requestId);
        return response.json();
    }

    async findOne(id: number, requestId: string): Promise<Product> {
        const response = await this.sendRequest(`/products/${id}`, requestId);
        return response.json();
    }

    async create(data: CreateProductRequest, requestId: string): Promise<Product> {
        const response = await this.sendRequest(
            '/products',
            requestId,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            },
        );
        return response.json();
    }

    async update(
        id: string,
        data: UpdateProductRequest,
        requestId: string,
    ): Promise<Product> {
        const response = await this.sendRequest(
            `/products/${id}`,
            requestId,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            },
        );

        return response.json();
    }

    async remove(
        id: string,
        requestId: string,
    ): Promise<{ message: string }> {
        const response = await this.sendRequest(
            `/products/${id}`,
            requestId,
            {
                method: 'DELETE',
            },
        );

        return response.json();
    }

    private async sendRequest(
        path: string,
        requestId: string,
        options: RequestInit = {},
    ): Promise<Response> {
        let response: Response;

        try {
            const headers = new Headers(options.headers);
            headers.set('x-request-id', requestId);

            response = await fetch(`${this.baseUrl}${path}`, {
                ...options,
                headers,
            });
        } catch {
            throw new BadGatewayException('Product Catalog Service is unavailable');
        }

        // Preserve client errors (400–499) from the Product Catalog Service.
        if (response.status >= 400 && response.status < 500) {
            const errorBody = await response
                .json()
                .catch(() => response.statusText || 'Downstream request failed');

            throw new HttpException(errorBody, response.status);
        }

        // Convert downstream server errors (500–599) into 502.
        if (!response.ok) {
            throw new BadGatewayException(
                'Product Catalog Service returned an error',
            );
        }

        return response;
    }
}