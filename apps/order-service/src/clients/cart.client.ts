import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

interface Cart {
    id: number;
    userId: number;
    items: {
        productId: number;
        quantity: number;
    }[];
}

@Injectable()
export class CartClient {
    private readonly baseUrl =
        process.env.SHOPPING_CART_URL ?? 'http://localhost:3003';

    async getCart(token: string): Promise<Cart> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}/cart`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
        } catch {
            throw new BadGatewayException(
                'Shopping Cart Service is unavailable',
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
                'Shopping Cart Service returned an error',
            );
        }

        return response.json();
    }
}