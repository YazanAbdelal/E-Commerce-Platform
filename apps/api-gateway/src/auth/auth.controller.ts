import {
    Body,
    Controller,
    Get,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';

import type { LoginRequest, LoginResponse } from '@app/contracts';

import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UserClient } from '../clients/user.client.js';
import type { Request as ExpressRequest } from 'express';

type RequestWithId = ExpressRequest & { id: string };

@Controller('auth')
export class AuthController {
    constructor(private readonly userClient: UserClient) { }

    @Post('login')
    login(
        @Body() data: LoginRequest,
        @Request() request: RequestWithId,
    ): Promise<LoginResponse> {
        return this.userClient.login(data, request.id);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() request: any) {
        return request.user;
    }
}