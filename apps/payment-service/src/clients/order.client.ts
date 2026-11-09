import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

interface Order {
    id: number;
    userId: number;
    totalAmount: string;
    status: string;
}

export type OrderStatusUpdate = 'CONFIRMED' | 'CANCELLED';

@Injectable()
export class OrderClient {
    private readonly baseUrl =
        process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004';

    async getOrder(
        orderId: number,
        authorization: string,
    ): Promise<Order> {
        const response = await this.sendRequest(
            `/orders/${orderId}`,
            authorization,
        );

        return response.json();
    }

    async updateOrderStatus(
        orderId: number,
        authorization: string,
        status: OrderStatusUpdate,
    ): Promise<Order> {
        const response = await this.sendRequest(
            `/orders/${orderId}/status`,
            authorization,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            },
        );

        return response.json();
    }

    private async sendRequest(
        path: string,
        authorization: string,
        options: RequestInit = {},
    ): Promise<Response> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                ...options,
                headers: {
                    Authorization: authorization,
                    ...options.headers,
                },
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
