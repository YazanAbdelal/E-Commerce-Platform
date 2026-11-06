import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

import type { Product } from '@app/contracts';

@Injectable()
export class ProductCatalogClient {
    private readonly baseUrl =
        process.env.PRODUCT_CATALOG_URL ?? 'http://localhost:3001';

    async findOne(id: number): Promise<Product> {
        const response = await this.sendRequest(`/products/${id}`);
        return response.json();
    }

    private async sendRequest(
        path: string,
        options: RequestInit = {},
    ): Promise<Response> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`, options);
        } catch {
            throw new BadGatewayException(
                'Product Catalog Service is unavailable',
            );
        }

        // Preserve downstream client errors (400–499).
        if (response.status >= 400 && response.status < 500) {
            const errorBody = await response
                .json()
                .catch(() => response.statusText || 'Downstream request failed');

            throw new HttpException(errorBody, response.status);
        }

        // Convert downstream server errors into 502.
        if (!response.ok) {
            throw new BadGatewayException(
                'Product Catalog Service returned an error',
            );
        }

        return response;
    }
}