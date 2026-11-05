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

    async register(data: CreateUserRequest): Promise<CreateUserResponse> {
        const response = await this.sendRequest('/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async login(data: LoginRequest): Promise<LoginResponse> {
        const response = await this.sendRequest('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.json();
    }

    async findOne(id: number): Promise<User> {
        const response = await this.sendRequest(`/users/${id}`);
        return response.json();
    }

    async updateOne(
        id: number,
        data: UpdateUserRequest,
    ): Promise<User> {
        const response = await this.sendRequest(`/users/${id}`, {
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
        options: RequestInit = {},
    ): Promise<Response> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`, options);
        } catch {
            throw new BadGatewayException('User Service is unavailable');
        }

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