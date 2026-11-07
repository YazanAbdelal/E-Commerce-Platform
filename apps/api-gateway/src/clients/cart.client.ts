
import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

@Injectable()
export class CartClient {
    private readonly baseUrl =
        process.env.CART_SERVICE_URL ?? 'http://localhost:3003';

    async getCart(
        authorization: string,
        requestId: string,
    ): Promise<unknown> {
        const response = await this.sendRequest(
            '/cart',
            authorization,
            requestId,
        );
        return response.json();
    }

    async addItem(
        authorization: string,
        requestId: string,
        data: { productId: number; quantity: number },
    ): Promise<unknown> {
        const response = await this.sendRequest(
            '/cart/items',
            authorization,
            requestId,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            },
        );

        return response.json();
    }

    async updateItem(
        authorization: string,
        requestId: string,
        productId: number,
        data: { quantity: number },
    ): Promise<unknown> {
        const response = await this.sendRequest(
            `/cart/items/${productId}`,
            authorization,
            requestId,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            },
        );

        return response.json();
    }

    async removeItem(
        authorization: string,
        requestId: string,
        productId: number,
    ): Promise<unknown> {
        const response = await this.sendRequest(
            `/cart/items/${productId}`,
            authorization,
            requestId,
            { method: 'DELETE' },
        );

        return response.json();
    }

    async clearCart(
        authorization: string,
        requestId: string,
    ): Promise<unknown> {
        const response = await this.sendRequest(
            '/cart',
            authorization,
            requestId,
            { method: 'DELETE' },
        );

        return response.json();
    }

    private async sendRequest(
        path: string,
        authorization: string,
        requestId: string,
        options: RequestInit = {},
    ): Promise<Response> {
        let response: Response;

        try {
            const headers = new Headers(options.headers);
            headers.set('Authorization', authorization);
            headers.set('x-request-id', requestId);

            response = await fetch(`${this.baseUrl}${path}`, {
                ...options,
                headers,
            });
        } catch {
            throw new BadGatewayException(
                'Shopping Cart Service is unavailable',
            );
        }

        // Keep the existing error handling below unchanged.

        if (response.status >= 400 && response.status < 500) {
            const errorBody = await response
                .json()
                .catch(() => response.statusText || 'Downstream request failed');

            throw new HttpException(errorBody, response.status);
        }

        if (!response.ok) {
            throw new BadGatewayException(
                'Shopping Cart Service returned an error',
            );
        }

        return response;
    }
}
