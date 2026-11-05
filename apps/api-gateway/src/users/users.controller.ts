import { Body, Controller, Get, Param, Post, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import {
    User,
    UserRole,
    type CreateUserRequest,
    type CreateUserResponse,
} from '@app/contracts';
import { UserClient } from '../clients/user.client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('users')
export class UsersController {
    constructor(private readonly userClient: UserClient) { }

    @Post()
    register(
        @Body() data: CreateUserRequest,
    ): Promise<CreateUserResponse> {
        return this.userClient.register(data);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id')
    findOne(
        @Param('id') id: string,
        @Request() request: any,
    ): Promise<User> {
        const requestedUserId = Number(id);
        const authenticatedUser = request.user;

        const isAdmin = authenticatedUser.role === UserRole.ADMIN;
        const isOwner = authenticatedUser.sub === requestedUserId;

        if (!isAdmin && !isOwner) {
            throw new ForbiddenException('You cannot access this user');
        }

        return this.userClient.findOne(requestedUserId);
    }
}