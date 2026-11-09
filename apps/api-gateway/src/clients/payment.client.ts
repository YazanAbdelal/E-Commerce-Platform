import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

interface Payment {
    id: number;
    userId: number;
    orderId: number;
    amount: string;
    currency: string;
    status: string;
    provider: string;
    providerPaymentId?: string;
}

@Injectable()
export class PaymentClient {
    private readonly baseUrl =
        process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3005';

    async createPayment(
        authorization: string,
        requestId: string,
        orderId: number,
        idempotencyKey?: string,
    ): Promise<Payment> {
        const headers = new Headers({
            'Content-Type': 'application/json',
        });

        if (idempotencyKey) {
            headers.set('Idempotency-Key', idempotencyKey);
        }

        const response = await this.sendRequest(
            '/payments',
            authorization,
            requestId,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ orderId }),
            },
        );

        return response.json();
    }

    async getPayments(
        authorization: string,
        requestId: string,
    ): Promise<Payment[]> {
        const response = await this.sendRequest(
            '/payments',
            authorization,
            requestId,
        );

        return response.json();
    }

    async getPayment(
        authorization: string,
        requestId: string,
        paymentId: number,
    ): Promise<Payment> {
        const response = await this.sendRequest(
            `/payments/${paymentId}`,
            authorization,
            requestId,
        );

        return response.json();
    }

    async capturePayment(
        authorization: string,
        requestId: string,
        paymentId: number,
    ): Promise<Payment> {
        const response = await this.sendRequest(
            `/payments/${paymentId}/capture`,
            authorization,
            requestId,
            { method: 'POST' },
        );

        return response.json();
    }

    async refundPayment(
        authorization: string,
        requestId: string,
        paymentId: number,
    ): Promise<Payment> {
        const response = await this.sendRequest(
            `/payments/${paymentId}/refund`,
            authorization,
            requestId,
            { method: 'POST' },
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
            throw new BadGatewayException('Payment Service is unavailable');
        }

        if (response.status >= 400 && response.status < 500) {
            const errorBody = await response
                .json()
                .catch(() => response.statusText || 'Downstream request failed');

            throw new HttpException(errorBody, response.status);
        }

        if (!response.ok) {
            throw new BadGatewayException(
                'Payment Service returned an error',
            );
        }

        return response;
    }
}
