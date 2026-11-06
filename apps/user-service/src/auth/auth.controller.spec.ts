import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: vi.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: vi.fn(() => true),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should log in a user', async () => {
    const loginDto = {
      email: 'user@example.com',
      password: 'Password123',
    };

    const expectedResult = {
      access_token: 'mock-jwt-token',
    };

    mockAuthService.login.mockResolvedValue(expectedResult);

    const result = await controller.login(loginDto);

    expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
    expect(result).toEqual(expectedResult);
  });

  it('should return the authenticated user profile', () => {
    const request = {
      user: {
        sub: 1,
        email: 'user@example.com',
        role: 'CUSTOMER',
      },
    };

    const result = controller.getProfile(request);

    expect(result).toEqual(request.user);
  });
});