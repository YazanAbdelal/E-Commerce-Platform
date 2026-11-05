import { BadRequestException, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dtos/create-user.dto.js';
import * as bcrypt from 'bcrypt';

import { Prisma } from '../generated/prisma/client.js';
import { UpdateUserDto } from './dtos/update-user.dto.js';


@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createUserDto: CreateUserDto) {
        const { email, password } = createUserDto;

        // bcrypt only processes up to 72 bytes.
        if (Buffer.byteLength(password, 'utf8') > 72) {
            throw new BadRequestException(
                'Password cannot exceed 72 bytes',
            );
        }

        // Hash the password before storing it.
        const hashedPassword = await bcrypt.hash(password, 12);

        // Store the user, but never return the password hash.
        try {
            return await this.prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    createdAt: true,
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email is already registered');
            }

            throw error;
        }
    }

    async findOne(id: number) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return user;
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                role: true,
            },
        });
    }

    async update(id: number, dto: UpdateUserDto) {
        const { email, currentPassword, newPassword } = dto;

        // Require at least one actual update.
        if (email === undefined && newPassword === undefined) {
            throw new BadRequestException('No changes provided');
        }

        // Password changes require both passwords.
        if (
            (currentPassword === undefined) !==
            (newPassword === undefined)
        ) {
            throw new BadRequestException(
                'Both currentPassword and newPassword are required to change the password',
            );
        }

        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { password: true },
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        const data: Prisma.UserUpdateInput = {};

        if (email !== undefined) {
            data.email = email;
        }

        if (newPassword !== undefined && currentPassword !== undefined) {
            if (Buffer.byteLength(newPassword, 'utf8') > 72) {
                throw new BadRequestException('Password cannot exceed 72 bytes');
            }

            const passwordMatches = await bcrypt.compare(
                currentPassword,
                user.password,
            );

            if (!passwordMatches) {
                throw new BadRequestException('Current password is incorrect');
            }

            data.password = await bcrypt.hash(newPassword, 12);
        }

        try {
            return await this.prisma.user.update({
                where: { id },
                data,
                select: {
                    id: true,
                    email: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email is already registered');
            }

            throw error;
        }
    }
}
