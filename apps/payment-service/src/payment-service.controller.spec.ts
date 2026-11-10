import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from './auth/guards/jwt-auth.guard.js';

import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentServiceController } from './payment-service.controller.js';
import { PaymentServiceService } from './payment-service.service.js';

function createRequest(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    headers: { authorization: 'Bearer token' },
    user: { sub: 7 },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

describe('PaymentServiceController', () => {
  let controller: PaymentServiceController;

  const mockService = {
    createPayment: vi.fn(),
    getPayments: vi.fn(),
    getPayment: vi.fn(),
    capturePayment: vi.fn(),
    refundPayment: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new PaymentServiceController(
      mockService as unknown as PaymentServiceService,
    );
  });

  it('should create a payment and forward the idempotency key', async () => {
    const dto: CreatePaymentDto = { orderId: 42 };
    const request = createRequest({ headers: { authorization: 'Bearer token', 'idempotency-key': 'key-1' } });
    mockService.createPayment.mockResolvedValue({ id: 5 });

    const result = await controller.createPayment(request, dto, 'key-1');

    expect(mockService.createPayment).toHaveBeenCalledWith(7, 42, 'Bearer token', 'key-1');
    expect(result).toEqual({ id: 5 });
  });

  it('should create a payment without an idempotency key', async () => {
    const dto: CreatePaymentDto = { orderId: 42 };
    const request = createRequest();
    mockService.createPayment.mockResolvedValue({ id: 5 });

    await controller.createPayment(request, dto);

    expect(mockService.createPayment).toHaveBeenCalledWith(7, 42, 'Bearer token', undefined);
  });

  it('should return all payments for the authenticated user', async () => {
    const request = createRequest();
    const expected = [{ id: 1 }, { id: 2 }];
    mockService.getPayments.mockResolvedValue(expected);

    const result = await controller.getPayments(request);

    expect(mockService.getPayments).toHaveBeenCalledWith(7);
    expect(result).toEqual(expected);
  });

  it('should return a single payment by id', async () => {
    const request = createRequest();
    const expected = { id: 9, status: 'COMPLETED' };
    mockService.getPayment.mockResolvedValue(expected);

    const result = await controller.getPayment(request, 9);

    expect(mockService.getPayment).toHaveBeenCalledWith(7, 9);
    expect(result).toEqual(expected);
  });

  it('should capture a payment', async () => {
    const request = createRequest();
    const expected = { id: 9, status: 'COMPLETED' };
    mockService.capturePayment.mockResolvedValue(expected);

    const result = await controller.capturePayment(request, 9);

    expect(mockService.capturePayment).toHaveBeenCalledWith(7, 9, 'Bearer token');
    expect(result).toEqual(expected);
  });

  it('should refund a payment', async () => {
    const request = createRequest();
    const expected = { id: 9, status: 'REFUNDED' };
    mockService.refundPayment.mockResolvedValue(expected);

    const result = await controller.refundPayment(request, 9);

    expect(mockService.refundPayment).toHaveBeenCalledWith(7, 9, 'Bearer token');
    expect(result).toEqual(expected);
  });
});
