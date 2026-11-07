import { Body, Controller, Get, Param, Post, UseGuards, Request, ForbiddenException, Patch } from '@nestjs/common';
import {
    UserRole,
    type CreateUserRequest,
    type CreateUserResponse,
} from '@app/contracts';
import { UserClient } from '../clients/user.client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { UpdateUserRequest, User } from '@app/contracts';
import type { Request as ExpressRequest } from 'express';

type RequestWithId = ExpressRequest & {
    id: string;
    user: any;
};

@Controller('users')
export class UsersController {
    constructor(private readonly userClient: UserClient) { }

    @Post()
    register(
        @Body() data: CreateUserRequest,
        @Request() request: RequestWithId,
    ): Promise<CreateUserResponse> {
        return this.userClient.register(data, request.id);
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

        return this.userClient.findOne(requestedUserId, request.id);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me')
    updateMe(
        @Body() data: UpdateUserRequest,
        @Request() request: any,
    ): Promise<User> {
        return this.userClient.updateOne(
            request.user.sub,
            data,
            request.id,
        );
    }
}