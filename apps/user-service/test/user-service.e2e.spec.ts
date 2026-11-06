import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';

import { UserServiceModule } from '../src/user-service.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('User Service (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        const testDatabaseUrl = process.env.USER_TEST_DATABASE_URL;

        if (!testDatabaseUrl) {
            throw new Error('USER_TEST_DATABASE_URL is not defined');
        }

        // Redirect PrismaService to the test database.
        process.env.USER_DATABASE_URL = testDatabaseUrl;

        const moduleFixture: TestingModule =
            await Test.createTestingModule({
                imports: [UserServiceModule],
            }).compile();

        app = moduleFixture.createNestApplication();

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );

        await app.init();

        prisma = app.get<PrismaService>(PrismaService);
    });

    beforeEach(async () => {
        await prisma.user.deleteMany();
    });

    afterAll(async () => {
        await app.close();
    });

    it('should register a user', async () => {
        const response = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'e2e@example.com',
                password: 'Password123',
            })
            .expect(201);

        expect(response.body).toMatchObject({
            email: 'e2e@example.com',
            role: 'CUSTOMER',
        });

        expect(response.body).toHaveProperty('id');
        expect(response.body).not.toHaveProperty('password');
    });

    it('should log in a registered user and return an access token', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'login@example.com',
                password: 'Password123',
            })
            .expect(201);

        const response = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'login@example.com',
                password: 'Password123',
            })
            .expect(201);

        expect(response.body).toHaveProperty('access_token');
        expect(typeof response.body.access_token).toBe('string');
        expect(response.body.access_token.length).toBeGreaterThan(0);
    });

    it('should return the authenticated user profile', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'profile@example.com',
                password: 'Password123',
            })
            .expect(201);

        const loginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'profile@example.com',
                password: 'Password123',
            })
            .expect(201);

        const token = loginResponse.body.access_token;

        const profileResponse = await request(app.getHttpServer())
            .get('/auth/profile')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(profileResponse.body).toMatchObject({
            sub: expect.any(Number),
            email: 'profile@example.com',
            role: 'CUSTOMER',
        });
    });

    it('should reject requests to the profile endpoint without a token', async () => {
        await request(app.getHttpServer())
            .get('/auth/profile')
            .expect(401);
    });

    it('should reject requests with an invalid token', async () => {
        await request(app.getHttpServer())
            .get('/auth/profile')
            .set('Authorization', 'Bearer invalid-token')
            .expect(401);
    });

    it('should reject login with an incorrect password', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'wrong-password@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'wrong-password@example.com',
                password: 'WrongPassword123',
            })
            .expect(401);
    });

    it('should reject login with an unregistered email', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'unknown@example.com',
                password: 'Password123',
            })
            .expect(401);
    });

    it('should retrieve a user by ID without exposing the password', async () => {
        const createResponse = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'retrieve@example.com',
                password: 'Password123',
            })
            .expect(201);

        const response = await request(app.getHttpServer())
            .get(`/users/${createResponse.body.id}`)
            .expect(200);

        expect(response.body).toMatchObject({
            id: createResponse.body.id,
            email: 'retrieve@example.com',
        });

        expect(response.body).not.toHaveProperty('password');
    });

    it('should return 404 when retrieving a nonexistent user', async () => {
        await request(app.getHttpServer())
            .get('/users/999999')
            .expect(404);
    });

    it('should reject an invalid user ID', async () => {
        await request(app.getHttpServer())
            .get('/users/invalid')
            .expect(400);
    });

    it('should reject registration with an already registered email', async () => {
        const user = {
            email: 'duplicate@example.com',
            password: 'Password123',
        };

        await request(app.getHttpServer())
            .post('/users')
            .send(user)
            .expect(201);

        await request(app.getHttpServer())
            .post('/users')
            .send(user)
            .expect(409);
    });

    it('should update a user email', async () => {
        const createResponse = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'old@example.com',
                password: 'Password123',
            })
            .expect(201);

        const response = await request(app.getHttpServer())
            .patch(`/users/${createResponse.body.id}`)
            .send({
                email: 'new@example.com',
            })
            .expect(200);

        expect(response.body.email).toBe('new@example.com');
        expect(response.body).not.toHaveProperty('password');
    });

    it('should update a user password', async () => {
        const createResponse = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'password-update@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${createResponse.body.id}`)
            .send({
                currentPassword: 'Password123',
                newPassword: 'NewPassword123',
            })
            .expect(200);

        // The new password should work.
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'password-update@example.com',
                password: 'NewPassword123',
            })
            .expect(201);

        // The old password should no longer work.
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'password-update@example.com',
                password: 'Password123',
            })
            .expect(401);
    });

    it('should reject a password update with an incorrect current password', async () => {
        const createResponse = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'incorrect-current@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${createResponse.body.id}`)
            .send({
                currentPassword: 'WrongPassword123',
                newPassword: 'NewPassword123',
            })
            .expect(400);
    });

    it('should reject an update with no changes', async () => {
        const createResponse = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'no-changes@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${createResponse.body.id}`)
            .send({})
            .expect(400);
    });

    it('should reject updating to an email that belongs to another user', async () => {
        const firstUser = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'first@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'second@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${firstUser.body.id}`)
            .send({
                email: 'second@example.com',
            })
            .expect(409);
    });

    it('should return 404 when updating a nonexistent user', async () => {
        await request(app.getHttpServer())
            .patch('/users/999999')
            .send({
                email: 'updated@example.com',
            })
            .expect(404);
    });


    it('should reject registration with an invalid email', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'not-an-email',
                password: 'Password123',
            })
            .expect(400);
    });

    it('should reject registration with a short password', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'short@example.com',
                password: '1234567',
            })
            .expect(400);
    });

    it('should reject registration with missing required fields', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'missing@example.com',
            })
            .expect(400);
    });

    it('should reject registration with unexpected properties', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'extra@example.com',
                password: 'Password123',
                role: 'ADMIN',
            })
            .expect(400);
    });

    it('should reject login with an invalid email', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'invalid-email',
                password: 'Password123',
            })
            .expect(400);
    });

    it('should reject login with unexpected properties', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                email: 'login-validation@example.com',
                password: 'Password123',
                role: 'ADMIN',
            })
            .expect(400);
    });

    it('should reject updating to an invalid email', async () => {
        const user = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'update-validation@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${user.body.id}`)
            .send({
                email: 'invalid-email',
            })
            .expect(400);
    });

    it('should reject updating to a short password', async () => {
        const user = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'short-update@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${user.body.id}`)
            .send({
                currentPassword: 'Password123',
                newPassword: '1234567',
            })
            .expect(400);
    });

    it('should reject updates with unexpected properties', async () => {
        const user = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'extra-update@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${user.body.id}`)
            .send({
                email: 'changed@example.com',
                role: 'ADMIN',
            })
            .expect(400);
    });

    it('should reject password updates without both current and new passwords', async () => {
        const user = await request(app.getHttpServer())
            .post('/users')
            .send({
                email: 'incomplete-password@example.com',
                password: 'Password123',
            })
            .expect(201);

        await request(app.getHttpServer())
            .patch(`/users/${user.body.id}`)
            .send({
                newPassword: 'NewPassword123',
            })
            .expect(400);
    });
});