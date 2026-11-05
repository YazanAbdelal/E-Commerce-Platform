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

@Controller('auth')
export class AuthController {
    constructor(private readonly userClient: UserClient) { }

    @Post('login')
    login(@Body() data: LoginRequest): Promise<LoginResponse> {
        return this.userClient.login(data);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() request: any) {
        return request.user;
    }
}