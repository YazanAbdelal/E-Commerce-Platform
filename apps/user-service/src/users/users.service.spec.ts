import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { Prisma } from '../generated/prisma/client.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user with a hashed password', async () => {
    const email = 'test@example.com';
    const password = 'SecurePassword123';

    const createdUser = {
      id: 1,
      email,
      role: 'CUSTOMER',
      createdAt: new Date(),
    };

    mockPrismaService.user.create.mockResolvedValue(createdUser);

    const result = await service.create({ email, password });

    const createArgs = mockPrismaService.user.create.mock.calls[0][0] as {
      data: {
        email: string;
        password: string;
      };
    };

    expect(createArgs.data.email).toBe(email);
    expect(createArgs.data.password).not.toBe(password);

    expect(
      await bcrypt.compare(password, createArgs.data.password),
    ).toBe(true);

    expect(result).toEqual(createdUser);
    expect(result).not.toHaveProperty('password');
  });

  it('should reject passwords exceeding 72 bytes', async () => {
    const password = 'a'.repeat(73);

    await expect(
      service.create({
        email: 'test@example.com',
        password,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.user.create).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when email already exists', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: ['email'] },
      },
    );

    mockPrismaService.user.create.mockRejectedValue(prismaError);

    await expect(
      service.create({
        email: 'existing@example.com',
        password: 'SecurePassword123',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should return a user without the password', async () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrismaService.user.findUnique.mockResolvedValue(user);

    const result = await service.findOne(1);

    expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    expect(result).toEqual(user);
    expect(result).not.toHaveProperty('password');
  });

  it('should throw NotFoundException when user does not exist', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('should find a user by email including the password hash', async () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      password: '$2b$12$hashedpassword',
      role: 'CUSTOMER',
    };

    mockPrismaService.user.findUnique.mockResolvedValue(user);

    const result = await service.findByEmail('test@example.com');

    expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
      },
    });

    expect(result).toEqual(user);
  });

  it('should update a user email', async () => {
    const updatedUser = {
      id: 1,
      email: 'new@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrismaService.user.findUnique.mockResolvedValue({
      password: 'existing-hash',
    });

    mockPrismaService.user.update.mockResolvedValue(updatedUser);

    const result = await service.update(1, {
      email: 'new@example.com',
    });

    expect(mockPrismaService.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        email: 'new@example.com',
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    expect(result).toEqual(updatedUser);
  });

  it('should reject an update with no changes', async () => {
    await expect(
      service.update(1, {}),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  it('should update a user password after verifying the current password', async () => {
    const currentPassword = 'OldPassword123';
    const newPassword = 'NewPassword456';

    const existingHash = await bcrypt.hash(currentPassword, 4);

    mockPrismaService.user.findUnique.mockResolvedValue({
      password: existingHash,
    });

    mockPrismaService.user.update.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.update(1, {
      currentPassword,
      newPassword,
    });

    const updateArgs = mockPrismaService.user.update.mock.calls[0][0] as {
      data: {
        password: string;
      };
    };

    expect(updateArgs.data.password).not.toBe(newPassword);

    expect(
      await bcrypt.compare(newPassword, updateArgs.data.password),
    ).toBe(true);

    expect(
      await bcrypt.compare(currentPassword, updateArgs.data.password),
    ).toBe(false);
  });

  it('should reject a password change when the current password is incorrect', async () => {
    const existingHash = await bcrypt.hash('CorrectPassword123', 4);

    mockPrismaService.user.findUnique.mockResolvedValue({
      password: existingHash,
    });

    await expect(
      service.update(1, {
        currentPassword: 'WrongPassword123',
        newPassword: 'NewPassword456',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when updating a nonexistent user', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(
      service.update(999, {
        email: 'new@example.com',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  it('should reject a password change when only one password is provided', async () => {
    await expect(
      service.update(1, {
        currentPassword: 'OldPassword123',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.update(1, {
        newPassword: 'NewPassword456',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  it('should reject a new password exceeding 72 bytes', async () => {
    const existingHash = await bcrypt.hash('OldPassword123', 4);

    mockPrismaService.user.findUnique.mockResolvedValue({
      password: existingHash,
    });

    await expect(
      service.update(1, {
        currentPassword: 'OldPassword123',
        newPassword: 'a'.repeat(73),
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when updating to an existing email', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: { target: ['email'] },
      },
    );

    mockPrismaService.user.findUnique.mockResolvedValue({
      password: 'existing-hash',
    });

    mockPrismaService.user.update.mockRejectedValue(prismaError);

    await expect(
      service.update(1, {
        email: 'existing@example.com',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should rethrow unexpected errors when creating a user', async () => {
    const error = new Error('Database connection failed');

    mockPrismaService.user.create.mockRejectedValue(error);

    await expect(
      service.create({
        email: 'test@example.com',
        password: 'SecurePassword123',
      }),
    ).rejects.toThrow(error);
  });

  it('should rethrow unexpected errors when updating a user', async () => {
    const error = new Error('Database connection failed');

    mockPrismaService.user.findUnique.mockResolvedValue({
      password: 'existing-hash',
    });

    mockPrismaService.user.update.mockRejectedValue(error);

    await expect(
      service.update(1, {
        email: 'new@example.com',
      }),
    ).rejects.toThrow(error);
  });
});