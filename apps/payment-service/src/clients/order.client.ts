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

@Injectable()
export class OrderClient {
    private readonly baseUrl =
        process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004';

    async getOrder(
        orderId: number,
        authorization: string,
    ): Promise<Order> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}/orders/${orderId}`, {
                headers: {
                    Authorization: authorization,
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

        return response.json();
    }
}
