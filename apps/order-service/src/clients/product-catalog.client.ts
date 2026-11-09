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
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}/products/${id}`);
        } catch {
            throw new BadGatewayException(
                'Product Catalog Service is unavailable',
            );
        }

        if (response.status >= 400 && response.status < 500) {
            const errorBody = await response
                .json()
                .catch(() => response.statusText || 'Downstream request failed');

            throw new HttpException(errorBody, response.status);
        }

        if (!response.ok) {
            throw new BadGatewayException(
                'Product Catalog Service returned an error',
            );
        }

        return response.json();
    }
}