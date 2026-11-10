import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';

import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

function createRequest(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    headers: { authorization: 'Bearer test-token' },
    user: { sub: 3 },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

describe('CartController', () => {
  let controller: CartController;

  const mockService = {
    getCart: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new CartController(mockService as unknown as CartService);
  });

  it('should return the cart for the authenticated user', async () => {
    const request = createRequest();
    const expected = { id: 1, userId: 3, items: [] };
    mockService.getCart.mockResolvedValue(expected);

    const result = await controller.getCart(request);

    expect(mockService.getCart).toHaveBeenCalledWith(3);
    expect(result).toEqual(expected);
  });

  it('should add an item to the cart', async () => {
    const request = createRequest();
    const dto: AddCartItemDto = { productId: 10, quantity: 2 };
    const expected = { id: 1, items: [{ productId: 10, quantity: 2 }] };
    mockService.addItem.mockResolvedValue(expected);

    const result = await controller.addItem(request, dto);

    expect(mockService.addItem).toHaveBeenCalledWith(3, 10, 2);
    expect(result).toEqual(expected);
  });

  it('should update an item quantity', async () => {
    const request = createRequest();
    const dto: UpdateCartItemDto = { quantity: 5 };
    const expected = { id: 1, items: [{ productId: 10, quantity: 5 }] };
    mockService.updateItem.mockResolvedValue(expected);

    const result = await controller.updateItem(request, 10, dto);

    expect(mockService.updateItem).toHaveBeenCalledWith(3, 10, 5);
    expect(result).toEqual(expected);
  });

  it('should remove an item from the cart', async () => {
    const request = createRequest();
    const expected = { id: 1, items: [] };
    mockService.removeItem.mockResolvedValue(expected);

    const result = await controller.removeItem(request, 10);

    expect(mockService.removeItem).toHaveBeenCalledWith(3, 10);
    expect(result).toEqual(expected);
  });

  it('should clear the cart', async () => {
    const request = createRequest();
    const expected = { deletedItems: 3 };
    mockService.clearCart.mockResolvedValue(expected);

    const result = await controller.clearCart(request);

    expect(mockService.clearCart).toHaveBeenCalledWith(3);
    expect(result).toEqual(expected);
  });
});
