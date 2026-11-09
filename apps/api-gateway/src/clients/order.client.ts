import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

@Injectable()
export class OrderClient {
    private readonly baseUrl =
        process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004';

    async createOrder(
        authorization: string,
        requestId: string,
    ): Promise<unknown> {
        const response = await this.sendRequest(
            '/orders',
            authorization,
            requestId,
            { method: 'POST' },
        );

        return response.json();
    }

    async getOrders(
        authorization: string,
        requestId: string,
    ): Promise<unknown> {
        const response = await this.sendRequest(
            '/orders',
            authorization,
            requestId,
        );

        return response.json();
    }

    async getOrder(
        authorization: string,
        requestId: string,
        orderId: number,
    ): Promise<unknown> {
        const response = await this.sendRequest(
            `/orders/${orderId}`,
            authorization,
            requestId,
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
                'Order Service is unavailable',
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
                'Order Service returned an error',
            );
        }

        return response;
    }
}