import { BadRequestException, Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dtos/create-user.dto.js';
import * as bcrypt from 'bcrypt';

import { Prisma } from '../generated/prisma/client.js';


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
}
