import { Test, TestingModule } from '@nestjs/testing';
import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from './auth/guards/jwt-auth.guard.js';

describe('OrderServiceController', () => {
  let controller: OrderServiceController;

  const mockOrderServiceService = {
    createOrder: vi.fn(),
    getOrders: vi.fn(),
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: vi.fn(() => true),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderServiceController],
      providers: [
        {
          provide: OrderServiceService,
          useValue: mockOrderServiceService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<OrderServiceController>(OrderServiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create an order', async () => {
    const request = {
      headers: { authorization: 'Bearer token' },
      user: { sub: 1 },
    } as unknown as AuthenticatedRequest;

    const expected = { id: 1, userId: 1 };
    mockOrderServiceService.createOrder.mockResolvedValue(expected);

    const result = await controller.createOrder(request);

    expect(mockOrderServiceService.createOrder).toHaveBeenCalledWith(
      1,
      'token',
    );
    expect(result).toEqual(expected);
  });

  it('should return orders for the authenticated user', async () => {
    const request = { user: { sub: 1 } } as unknown as AuthenticatedRequest;

    const expected = [{ id: 1, userId: 1 }];
    mockOrderServiceService.getOrders.mockResolvedValue(expected);

    const result = await controller.getOrders(request);

    expect(mockOrderServiceService.getOrders).toHaveBeenCalledWith(1);
    expect(result).toEqual(expected);
  });

  it('should return an order by id', async () => {
    const request = { user: { sub: 1 } } as unknown as AuthenticatedRequest;

    const expected = { id: 1, userId: 1 };
    mockOrderServiceService.getOrder.mockResolvedValue(expected);

    const result = await controller.getOrder(request, 1);

    expect(mockOrderServiceService.getOrder).toHaveBeenCalledWith(1, 1);
    expect(result).toEqual(expected);
  });

  it('should update an order status', async () => {
    const request = { user: { sub: 1 } } as unknown as AuthenticatedRequest;

    const expected = { id: 1, userId: 1, status: 'CONFIRMED' };
    mockOrderServiceService.updateOrderStatus.mockResolvedValue(expected);

    const result = await controller.updateOrderStatus(request, 1, {
      status: 'CONFIRMED',
    });

    expect(mockOrderServiceService.updateOrderStatus).toHaveBeenCalledWith(
      1,
      1,
      'CONFIRMED',
    );
    expect(result).toEqual(expected);
  });
});
