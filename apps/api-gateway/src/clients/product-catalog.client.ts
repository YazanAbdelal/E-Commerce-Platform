import { BadGatewayException, Injectable, NotFoundException, Param } from '@nestjs/common';
import type { Product } from '@app/contracts';

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

    private async sendRequest(path: string): Promise<Response> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`);
        } catch {
            throw new BadGatewayException('Product Catalog Service is unavailable');
        }

        if (response.status === 404) {
            throw new NotFoundException('Product not found.');
        }

        if (!response.ok) {
            throw new BadGatewayException('Product Catalog Service returned an error.');
        }

        return response;
    }
}