import { BadGatewayException, HttpException, Injectable, NotFoundException, Param } from '@nestjs/common';
import type { CreateProductRequest, Product } from '@app/contracts';

@Injectable()
export class ProductCatalogClient {
    private readonly baseUrl = process.env.PRODUCT_CATALOG_URL ?? 'http://localhost:3001';

    async findAll(): Promise<Product[]> {
        const response = await this.sendRequest('/products');
        return response.json();
    }

    async findOne(id: number): Promise<Product> {
        const response = await this.sendRequest(`/products/${id}`);
        return response.json();
    }

    async create(data: CreateProductRequest): Promise<Product> {
        const response = await fetch(`${this.baseUrl}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    private async sendRequest(path: string): Promise<Response> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`);
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