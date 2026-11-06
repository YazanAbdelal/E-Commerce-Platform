import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import * as bcrypt from 'bcrypt';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService Integration', () => {
    let service: UsersService;
    let prisma: PrismaService;
    let module: TestingModule;

    beforeAll(async () => {
        const testDatabaseUrl = process.env.USER_TEST_DATABASE_URL;

        if (!testDatabaseUrl) {
            throw new Error('USER_TEST_DATABASE_URL is not defined');
        }

        // Ensure PrismaService connects to the test database.
        process.env.USER_DATABASE_URL = testDatabaseUrl;

        module = await Test.createTestingModule({
            providers: [UsersService, PrismaService],
        }).compile();

        await module.init();

        service = module.get<UsersService>(UsersService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    beforeEach(async () => {
        await prisma.user.deleteMany();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should create a user in the database', async () => {
        const result = await service.create({
            email: 'integration@example.com',
            password: 'Password123',
        });

        expect(result).toMatchObject({
            id: expect.any(Number),
            email: 'integration@example.com',
            role: 'CUSTOMER',
        });

        // Verify the user actually exists in PostgreSQL.
        const savedUser = await prisma.user.findUnique({
            where: { email: 'integration@example.com' },
        });

        expect(savedUser).not.toBeNull();
        expect(savedUser?.password).not.toBe('Password123');
    });

    it('should retrieve a user from the database', async () => {
        const createdUser = await service.create({
            email: 'retrieve@example.com',
            password: 'Password123',
        });

        const result = await service.findOne(createdUser.id);

        expect(result).toMatchObject({
            id: createdUser.id,
            email: 'retrieve@example.com',
        });

        expect(result).not.toHaveProperty('password');
    });

    it('should update a user email in the database', async () => {
        const createdUser = await service.create({
            email: 'old@example.com',
            password: 'Password123',
        });

        const result = await service.update(createdUser.id, {
            email: 'new@example.com',
        });

        expect(result.email).toBe('new@example.com');

        const updatedUser = await prisma.user.findUnique({
            where: { id: createdUser.id },
        });

        expect(updatedUser?.email).toBe('new@example.com');
    });

    it('should update a user password in the database', async () => {
        const createdUser = await service.create({
            email: 'password@example.com',
            password: 'OldPassword123',
        });

        const result = await service.update(createdUser.id, {
            currentPassword: 'OldPassword123',
            newPassword: 'NewPassword123',
        });

        expect(result).not.toHaveProperty('password');

        const updatedUser = await prisma.user.findUnique({
            where: { id: createdUser.id },
        });

        expect(updatedUser).not.toBeNull();

        const passwordMatches = await bcrypt.compare(
            'NewPassword123',
            updatedUser!.password,
        );

        expect(passwordMatches).toBe(true);

        const oldPasswordMatches = await bcrypt.compare(
            'OldPassword123',
            updatedUser!.password,
        );

        expect(oldPasswordMatches).toBe(false);
    });

    it('should reject creating a user with an existing email', async () => {
        await service.create({
            email: 'duplicate@example.com',
            password: 'Password123',
        });

        await expect(
            service.create({
                email: 'duplicate@example.com',
                password: 'AnotherPassword123',
            }),
        ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when a user does not exist', async () => {
        await expect(
            service.findOne(999999),
        ).rejects.toThrow(NotFoundException);
    });

    it('should find a user by email including the password hash', async () => {
        await service.create({
            email: 'login@example.com',
            password: 'Password123',
        });

        const result = await service.findByEmail('login@example.com');

        expect(result).not.toBeNull();
        expect(result?.email).toBe('login@example.com');
        expect(result?.password).not.toBe('Password123');

        const passwordMatches = await bcrypt.compare(
            'Password123',
            result!.password,
        );

        expect(passwordMatches).toBe(true);
    });

    it('should reject updating to an email already in use', async () => {
        const firstUser = await service.create({
            email: 'first@example.com',
            password: 'Password123',
        });

        await service.create({
            email: 'second@example.com',
            password: 'Password123',
        });

        await expect(
            service.update(firstUser.id, {
                email: 'second@example.com',
            }),
        ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when updating a nonexistent user', async () => {
        await expect(
            service.update(999999, {
                email: 'new@example.com',
            }),
        ).rejects.toThrow(NotFoundException);
    });
});