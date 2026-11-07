import {
    BadGatewayException,
    HttpException,
    Injectable,
} from '@nestjs/common';

import type {
    CreateUserRequest,
    CreateUserResponse,
    LoginRequest,
    LoginResponse,
    UpdateUserRequest,
    User,
} from '@app/contracts';

@Injectable()
export class UserClient {
    private readonly baseUrl =
        process.env.USER_SERVICE_URL ?? 'http://localhost:3002';

    async register(
        data: CreateUserRequest,
        requestId: string,
    ): Promise<CreateUserResponse> {
        const response = await this.sendRequest('/users', requestId, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async login(
        data: LoginRequest,
        requestId: string,
    ): Promise<LoginResponse> {
        const response = await this.sendRequest('/auth/login', requestId, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async findOne(id: number, requestId: string): Promise<User> {
        const response = await this.sendRequest(`/users/${id}`, requestId);
        return response.json();
    }

    async updateOne(
        id: number,
        data: UpdateUserRequest,
        requestId: string,
    ): Promise<User> {
        const response = await this.sendRequest(`/users/${id}`, requestId, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    private async sendRequest(
        path: string,
        requestId: string,
        options: RequestInit = {},
    ): Promise<Response> {
        let response: Response;

        try {
            const headers = new Headers(options.headers);
            headers.set('x-request-id', requestId);

            response = await fetch(`${this.baseUrl}${path}`, {
                ...options,
                headers,
            });
        } catch {
            throw new BadGatewayException('User Service is unavailable');
        }

        // Keep your existing error handling below this point.

        // Preserve client errors (400–499) from the User Service.
        if (response.status >= 400 && response.status < 500) {
            const errorBody = await response
                .json()
                .catch(() => response.statusText || 'Downstream request failed');

            throw new HttpException(errorBody, response.status);
        }

        // Convert downstream server errors (500–599) into 502.
        if (!response.ok) {
            throw new BadGatewayException(
                'User Service returned an error',
            );
        }

        return response;
    }
}