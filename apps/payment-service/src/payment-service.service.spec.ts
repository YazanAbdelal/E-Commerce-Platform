import { Test, TestingModule } from '@nestjs/testing';
import { PaymentServiceService } from './payment-service.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { OrderClient } from './clients/order.client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';

describe('PaymentServiceService', () => {
  let service: PaymentServiceService;

  const mockPrismaService = {
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const mockOrderClient = {
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentServiceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: OrderClient,
          useValue: mockOrderClient,
        },
      ],
    }).compile();

    service = module.get<PaymentServiceService>(PaymentServiceService);
  });

  describe('createPayment', () => {
    const userId = 1;
    const orderId = 10;
    const authorization = 'Bearer valid-token';

    const order = {
      id: orderId,
      userId,
      totalAmount: '99.99',
      status: 'PENDING',
    };

    beforeEach(() => {
      mockOrderClient.getOrder.mockResolvedValue(order);
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.create.mockResolvedValue({
        id: 1,
        userId,
        orderId,
        amount: '99.99',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should create a payment using the order total', async () => {
      const result = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      expect(mockOrderClient.getOrder).toHaveBeenCalledWith(
        orderId,
        authorization,
      );
      expect(mockPrismaService.payment.findUnique).toHaveBeenCalledWith({
        where: { orderId },
      });
      expect(mockPrismaService.payment.create).toHaveBeenCalledWith({
        data: {
          userId,
          orderId,
          idempotencyKey: undefined,
          amount: '99.99',
          status: 'PENDING',
        },
      });
      expect(result).toEqual({
        id: 1,
        userId,
        orderId,
        amount: '99.99',
        status: 'PENDING',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should ignore any client-supplied amount and use the order total', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        ...order,
        totalAmount: '2025.00',
      });

      await service.createPayment(userId, orderId, authorization);

      expect(mockPrismaService.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: '2025.00' }),
      });
    });

    it('should throw BadRequestException when the order id is invalid', async () => {
      await expect(
        service.createPayment(userId, 0, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockOrderClient.getOrder).not.toHaveBeenCalled();
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should return the existing payment for a repeated idempotency key', async () => {
      const existing = {
        id: 1,
        userId,
        orderId,
        amount: '99.99',
        status: 'PENDING',
      };
      mockPrismaService.payment.findUnique.mockResolvedValue(existing);

      const result = await service.createPayment(
        userId,
        orderId,
        authorization,
        'checkout-key',
      );

      expect(result).toEqual(existing);
      expect(mockOrderClient.getOrder).not.toHaveBeenCalled();
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should reject an idempotency key reused for a different order', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue({
        id: 1,
        userId,
        orderId: 999,
      });

      await expect(
        service.createPayment(userId, orderId, authorization, 'checkout-key'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when the order is not payable', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        ...order,
        status: 'CANCELLED',
      });

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when a payment already exists for the order', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue({
        id: 1,
        userId,
        orderId,
        amount: '99.99',
        status: 'PENDING',
      });

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should return the existing payment when the unique constraint is hit with the same key', async () => {
      const existing = {
        id: 1,
        userId,
        orderId,
        amount: '99.99',
        status: 'PENDING',
      };
      mockPrismaService.payment.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);
      mockPrismaService.payment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const result = await service.createPayment(
        userId,
        orderId,
        authorization,
        'checkout-key',
      );

      expect(result).toEqual(existing);
    });

    it('should throw BadGatewayException when the order service is unavailable', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new BadGatewayException('Order Service is unavailable'),
      );

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow(BadGatewayException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should convert unexpected order service failures into BadGatewayException', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow(BadGatewayException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should propagate 404 from the order service when the order does not exist', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new HttpException('Order not found', 404),
      );

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toMatchObject({ status: 404 });
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when the order belongs to another user', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        ...order,
        userId: 2,
      });

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow(BadGatewayException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('getPayments', () => {
    it('should return all payments for a user ordered by creation date', async () => {
      const payments = [
        { id: 2, userId: 1 },
        { id: 1, userId: 1 },
      ];
      mockPrismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.getPayments(1);

      expect(mockPrismaService.payment.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(payments);
    });

    it('should return an empty list when the user has no payments', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      const result = await service.getPayments(1);

      expect(result).toEqual([]);
    });
  });

  describe('getPayment', () => {
    it('should return the payment when it belongs to the user', async () => {
      const payment = { id: 1, userId: 1, orderId: 10 };
      mockPrismaService.payment.findFirst.mockResolvedValue(payment);

      const result = await service.getPayment(1, 1);

      expect(mockPrismaService.payment.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
      });
      expect(result).toEqual(payment);
    });

    it('should throw NotFoundException when the payment does not exist', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(service.getPayment(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when the payment belongs to another user', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(service.getPayment(2, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('capturePayment', () => {
    const userId = 1;
    const paymentId = 1;
    const authorization = 'Bearer valid-token';

    const pendingPayment = {
      id: paymentId,
      userId,
      orderId: 10,
      amount: '99.99',
      status: 'PENDING',
      providerPaymentId: null,
    };

    it('should capture a pending payment and confirm the order', async () => {
      const completedPayment = {
        ...pendingPayment,
        status: 'COMPLETED',
        providerPaymentId: 'prov_123',
      };
      mockPrismaService.payment.findFirst
        .mockResolvedValueOnce(pendingPayment)
        .mockResolvedValueOnce(completedPayment);
      mockPrismaService.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.capturePayment(
        userId,
        paymentId,
        authorization,
      );

      expect(mockPrismaService.payment.updateMany).toHaveBeenCalledWith({
        where: { id: paymentId, userId, status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          providerPaymentId: expect.any(String),
        },
      });
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        pendingPayment.orderId,
        authorization,
        'CONFIRMED',
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('should re-sync the order when the payment is already completed', async () => {
      const completedPayment = {
        ...pendingPayment,
        status: 'COMPLETED',
      };
      mockPrismaService.payment.findFirst.mockResolvedValue(completedPayment);

      const result = await service.capturePayment(
        userId,
        paymentId,
        authorization,
      );

      expect(mockPrismaService.payment.updateMany).not.toHaveBeenCalled();
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        completedPayment.orderId,
        authorization,
        'CONFIRMED',
      );
      expect(result).toEqual(completedPayment);
    });

    it('should handle a concurrent capture that completed the payment first', async () => {
      const completedPayment = {
        ...pendingPayment,
        status: 'COMPLETED',
      };
      mockPrismaService.payment.findFirst
        .mockResolvedValueOnce(pendingPayment)
        .mockResolvedValueOnce(completedPayment);
      mockPrismaService.payment.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.capturePayment(
        userId,
        paymentId,
        authorization,
      );

      expect(result.status).toBe('COMPLETED');
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        completedPayment.orderId,
        authorization,
        'CONFIRMED',
      );
    });

    it('should throw BadRequestException when the payment is already refunded', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        ...pendingPayment,
        status: 'REFUNDED',
      });

      await expect(
        service.capturePayment(userId, paymentId, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('refundPayment', () => {
    const userId = 1;
    const paymentId = 1;
    const authorization = 'Bearer valid-token';

    const completedPayment = {
      id: paymentId,
      userId,
      orderId: 10,
      amount: '99.99',
      status: 'COMPLETED',
    };

    it('should refund a completed payment and cancel the order', async () => {
      const refundedPayment = {
        ...completedPayment,
        status: 'REFUNDED',
      };
      mockPrismaService.payment.findFirst
        .mockResolvedValueOnce(completedPayment)
        .mockResolvedValueOnce(refundedPayment);
      mockPrismaService.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.refundPayment(
        userId,
        paymentId,
        authorization,
      );

      expect(mockPrismaService.payment.updateMany).toHaveBeenCalledWith({
        where: { id: paymentId, userId, status: 'COMPLETED' },
        data: { status: 'REFUNDED' },
      });
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        completedPayment.orderId,
        authorization,
        'CANCELLED',
      );
      expect(result.status).toBe('REFUNDED');
    });

    it('should re-sync the order when the payment is already refunded', async () => {
      const refundedPayment = {
        ...completedPayment,
        status: 'REFUNDED',
      };
      mockPrismaService.payment.findFirst.mockResolvedValue(refundedPayment);

      const result = await service.refundPayment(
        userId,
        paymentId,
        authorization,
      );

      expect(mockPrismaService.payment.updateMany).not.toHaveBeenCalled();
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        refundedPayment.orderId,
        authorization,
        'CANCELLED',
      );
      expect(result).toEqual(refundedPayment);
    });

    it('should throw BadRequestException when the payment is not completed', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        ...completedPayment,
        status: 'PENDING',
      });

      await expect(
        service.refundPayment(userId, paymentId, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.updateMany).not.toHaveBeenCalled();
    });
  });
});
