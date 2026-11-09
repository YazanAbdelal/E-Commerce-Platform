import { Test, TestingModule } from '@nestjs/testing';
import { PaymentServiceService } from './payment-service.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { OrderClient } from './clients/order.client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

describe('PaymentServiceService', () => {
  let service: PaymentServiceService;

  const mockPrismaService = {
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockOrderClient = {
    getOrder: vi.fn(),
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
    const amount = 99.99;
    const authorization = 'Bearer valid-token';

    beforeEach(() => {
      mockOrderClient.getOrder.mockResolvedValue({
        id: orderId,
        userId,
        totalAmount: '99.99',
        status: 'PENDING',
      });
      mockPrismaService.payment.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.create.mockResolvedValue({
        id: 1,
        userId,
        orderId,
        amount,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should create a payment for a valid order', async () => {
      const result = await service.createPayment(
        userId,
        orderId,
        amount,
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
          amount,
          status: 'PENDING',
        },
      });
      expect(result).toEqual({
        id: 1,
        userId,
        orderId,
        amount,
        status: 'PENDING',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should throw BadRequestException when amount is invalid', async () => {
      await expect(
        service.createPayment(userId, orderId, -10, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockOrderClient.getOrder).not.toHaveBeenCalled();
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when amount is NaN', async () => {
      await expect(
        service.createPayment(userId, orderId, NaN, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockOrderClient.getOrder).not.toHaveBeenCalled();
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the order id is invalid', async () => {
      await expect(
        service.createPayment(userId, 0, amount, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockOrderClient.getOrder).not.toHaveBeenCalled();
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when a payment already exists for the order', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue({
        id: 1,
        userId,
        orderId,
        amount,
        status: 'PENDING',
      });

      await expect(
        service.createPayment(userId, orderId, amount, authorization),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when the order service is unavailable', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new BadGatewayException('Order Service is unavailable'),
      );

      await expect(
        service.createPayment(userId, orderId, amount, authorization),
      ).rejects.toThrow(BadGatewayException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should convert unexpected order service failures into BadGatewayException', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(
        service.createPayment(userId, orderId, amount, authorization),
      ).rejects.toThrow(BadGatewayException);
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should propagate 404 from the order service when the order does not exist', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new HttpException('Order not found', 404),
      );

      await expect(
        service.createPayment(userId, orderId, amount, authorization),
      ).rejects.toMatchObject({ status: 404 });
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when the order belongs to another user', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        id: orderId,
        userId: 2,
        totalAmount: '99.99',
        status: 'PENDING',
      });

      await expect(
        service.createPayment(userId, orderId, amount, authorization),
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

    beforeEach(() => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: paymentId,
        userId,
        orderId: 10,
        amount: 99.99,
        status: 'PENDING',
        providerPaymentId: null,
      });
    });

    it('should capture a pending payment', async () => {
      mockPrismaService.payment.update.mockResolvedValue({
        id: paymentId,
        userId,
        status: 'COMPLETED',
        providerPaymentId: 'prov_123',
      });

      const result = await service.capturePayment(userId, paymentId);

      expect(mockPrismaService.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: {
          status: 'COMPLETED',
          providerPaymentId: expect.any(String),
        },
      });
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw BadRequestException when the payment is already completed', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: paymentId,
        userId,
        status: 'COMPLETED',
      });

      await expect(
        service.capturePayment(userId, paymentId),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the payment is already refunded', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: paymentId,
        userId,
        status: 'REFUNDED',
      });

      await expect(
        service.capturePayment(userId, paymentId),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('refundPayment', () => {
    const userId = 1;
    const paymentId = 1;

    beforeEach(() => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: paymentId,
        userId,
        orderId: 10,
        amount: 99.99,
        status: 'COMPLETED',
      });
    });

    it('should refund a completed payment', async () => {
      mockPrismaService.payment.update.mockResolvedValue({
        id: paymentId,
        userId,
        status: 'REFUNDED',
      });

      const result = await service.refundPayment(userId, paymentId);

      expect(mockPrismaService.payment.update).toHaveBeenCalledWith({
        where: { id: paymentId },
        data: { status: 'REFUNDED' },
      });
      expect(result.status).toBe('REFUNDED');
    });

    it('should throw BadRequestException when the payment is not completed', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: paymentId,
        userId,
        status: 'PENDING',
      });

      await expect(
        service.refundPayment(userId, paymentId),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.payment.update).not.toHaveBeenCalled();
    });
  });
});
