import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    create: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a user', async () => {
    const createUserDto = {
      email: 'user@example.com',
      password: 'Password123',
    };

    const expectedResult = {
      id: 1,
      email: 'user@example.com',
      role: 'CUSTOMER',
      createdAt: new Date(),
    };

    mockUsersService.create.mockResolvedValue(expectedResult);

    const result = await controller.create(createUserDto);

    expect(mockUsersService.create).toHaveBeenCalledWith(createUserDto);
    expect(result).toEqual(expectedResult);
  });

  it('should return a user by ID', async () => {
    const expectedResult = {
      id: 1,
      email: 'user@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockUsersService.findOne.mockResolvedValue(expectedResult);

    const result = await controller.findOne(1);

    expect(mockUsersService.findOne).toHaveBeenCalledWith(1);
    expect(result).toEqual(expectedResult);
  });

  it('should update a user', async () => {
    const updateUserDto = {
      email: 'newemail@example.com',
    };

    const expectedResult = {
      id: 1,
      email: 'newemail@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockUsersService.update.mockResolvedValue(expectedResult);

    const result = await controller.update(1, updateUserDto);

    expect(mockUsersService.update).toHaveBeenCalledWith(
      1,
      updateUserDto,
    );
    expect(result).toEqual(expectedResult);
  });
});