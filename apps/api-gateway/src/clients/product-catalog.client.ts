import { BadGatewayException, HttpException, Injectable, NotFoundException, Param } from '@nestjs/common';
import type { CreateProductRequest, PaginatedResponse, Product, UpdateProductRequest } from '@app/contracts';

@Injectable()
export class ProductCatalogClient {
    private readonly baseUrl = process.env.PRODUCT_CATALOG_URL ?? 'http://localhost:3001';

    async findAll(
        query: Record<string, string | undefined>,
    ): Promise<PaginatedResponse<Product>> {
        const queryString = new URLSearchParams(
            Object.entries(query).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
            ),
        ).toString();

        const path = queryString
            ? `/products?${queryString}`
            : '/products';

        const response = await this.sendRequest(path);
        return response.json();
    }

    async findOne(id: number): Promise<Product> {
        const response = await this.sendRequest(`/products/${id}`);
        return response.json();
    }

    async create(data: CreateProductRequest): Promise<Product> {
        const response = await this.sendRequest(`/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async update(id: string, data: UpdateProductRequest): Promise<Product> {
        const response = await this.sendRequest(`/products/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async remove(id: string): Promise<{ message: string }> {
        const response = await this.sendRequest(`/products/${id}`, {
            method: 'DELETE',
        });

        return response.json();
    }

    private async sendRequest(path: string, options: RequestInit = {}): Promise<Response> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`, options);
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