import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: vi.fn(),
  };

  const mockJwtService = {
    signAsync: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should log in a user and return an access token', async () => {
    const password = 'Password123';

    const hashedPassword = await bcrypt.hash(password, 4);

    mockUsersService.findByEmail.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      password: hashedPassword,
      role: 'CUSTOMER',
    });

    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');

    const result = await service.login({
      email: 'user@example.com',
      password,
    });

    expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );

    expect(mockJwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      email: 'user@example.com',
      role: 'CUSTOMER',
    });

    expect(result).toEqual({
      access_token: 'mock-jwt-token',
    });
  });

  it('should throw UnauthorizedException when the email does not exist', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'unknown@example.com',
        password: 'Password123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
      'unknown@example.com',
    );

    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when the password is incorrect', async () => {
    const hashedPassword = await bcrypt.hash('CorrectPassword123', 4);

    mockUsersService.findByEmail.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      password: hashedPassword,
      role: 'CUSTOMER',
    });

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'WrongPassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
  });

  it('should reject passwords exceeding 72 bytes', async () => {
    await expect(
      service.login({
        email: 'user@example.com',
        password: 'a'.repeat(73),
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockUsersService.findByEmail).not.toHaveBeenCalled();
    expect(mockJwtService.signAsync).not.toHaveBeenCalled();
  });

  it('should reject passwords exceeding 72 bytes', async () => {
    const password = 'a'.repeat(73);

    await expect(
      service.login({
        email: 'test@example.com',
        password,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});