import 'dotenv/config';

import {
  afterAll,
  beforeEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PaymentServiceService } from './payment-service.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { OrderClient } from './clients/order.client.js';

describe('PaymentServiceService integration', () => {
  let prisma: PrismaService;
  let service: PaymentServiceService;

  const userId = 1;
  const orderId = 10;
  const authorization = 'Bearer valid-token';

  const mockOrderClient = {
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
  };

  const mockOrder = {
    id: orderId,
    userId,
    totalAmount: '99.99',
    status: 'PENDING',
  };

  beforeAll(async () => {
    const testDatabaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error('PAYMENT_TEST_DATABASE_URL is not configured');
    }

    process.env.PAYMENT_DATABASE_URL = testDatabaseUrl;

    prisma = new PrismaService();
    await prisma.$connect();

    service = new PaymentServiceService(
      prisma,
      mockOrderClient as unknown as OrderClient,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany();
    mockOrderClient.getOrder.mockReset();
    mockOrderClient.updateOrderStatus.mockReset();
    mockOrderClient.updateOrderStatus.mockResolvedValue(mockOrder);
  });

  describe('createPayment', () => {
    it('should persist a payment using the order total', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const payment = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      expect(payment.id).toBeDefined();
      expect(payment.userId).toBe(userId);
      expect(payment.orderId).toBe(orderId);
      expect(Number(payment.amount)).toBe(99.99);
      expect(payment.status).toBe('PENDING');

      const savedPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
      });

      expect(savedPayment).not.toBeNull();
      expect(Number(savedPayment!.amount)).toBe(99.99);
      expect(savedPayment!.status).toBe('PENDING');
    });

    it('should ignore a client amount because it is not part of the request', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        ...mockOrder,
        totalAmount: '2025.00',
      });

      const payment = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      expect(Number(payment.amount)).toBe(2025);
    });

    it('should return the same payment for a repeated idempotency key', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const first = await service.createPayment(
        userId,
        orderId,
        authorization,
        'checkout-key',
      );
      const second = await service.createPayment(
        userId,
        orderId,
        authorization,
        'checkout-key',
      );

      expect(second.id).toBe(first.id);
      expect(await prisma.payment.count()).toBe(1);
    });

    it('should not persist a duplicate payment for the same order', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      await service.createPayment(userId, orderId, authorization);

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow();

      const paymentCount = await prisma.payment.count({
        where: { orderId },
      });
      expect(paymentCount).toBe(1);
    });

    it('should not persist a payment for an order that is not pending', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        ...mockOrder,
        status: 'CANCELLED',
      });

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow();

      expect(await prisma.payment.count()).toBe(0);
    });

    it('should not persist a payment when the order service is unavailable', async () => {
      mockOrderClient.getOrder.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(
        service.createPayment(userId, orderId, authorization),
      ).rejects.toThrow();

      const paymentCount = await prisma.payment.count();
      expect(paymentCount).toBe(0);
    });
  });

  describe('getPayments', () => {
    it('should return all payments for a user from the database', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      await service.createPayment(userId, orderId, authorization);
      await service.createPayment(userId, orderId + 1, authorization);

      const payments = await service.getPayments(userId);

      expect(payments).toHaveLength(2);
      expect(payments.every((payment) => payment.userId === userId)).toBe(true);
    });

    it('should return an empty list when the user has no payments', async () => {
      const payments = await service.getPayments(999);

      expect(payments).toEqual([]);
    });
  });

  describe('getPayment', () => {
    it('should return the payment when it belongs to the user', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      const payment = await service.getPayment(userId, created.id);

      expect(payment.id).toBe(created.id);
      expect(payment.userId).toBe(userId);
    });

    it('should throw when the payment does not exist', async () => {
      await expect(service.getPayment(userId, 999999999)).rejects.toThrow();
    });

    it('should throw when the payment belongs to another user', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      await expect(service.getPayment(2, created.id)).rejects.toThrow();
    });
  });

  describe('capturePayment', () => {
    it('should capture a pending payment and confirm the order', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      const captured = await service.capturePayment(
        userId,
        created.id,
        authorization,
      );

      expect(captured.status).toBe('COMPLETED');
      expect(captured.providerPaymentId).toBeDefined();
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        orderId,
        authorization,
        'CONFIRMED',
      );

      const savedPayment = await prisma.payment.findUnique({
        where: { id: created.id },
      });
      expect(savedPayment!.status).toBe('COMPLETED');
    });

    it('should re-sync the order when capturing an already completed payment', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await service.createPayment(
        userId,
        orderId,
        authorization,
      );
      await service.capturePayment(userId, created.id, authorization);
      mockOrderClient.updateOrderStatus.mockClear();

      const captured = await service.capturePayment(
        userId,
        created.id,
        authorization,
      );

      expect(captured.status).toBe('COMPLETED');
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        orderId,
        authorization,
        'CONFIRMED',
      );
    });
  });

  describe('refundPayment', () => {
    it('should refund a completed payment and cancel the order', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await service.createPayment(
        userId,
        orderId,
        authorization,
      );
      await service.capturePayment(userId, created.id, authorization);
      mockOrderClient.updateOrderStatus.mockClear();

      const refunded = await service.refundPayment(
        userId,
        created.id,
        authorization,
      );

      expect(refunded.status).toBe('REFUNDED');
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        orderId,
        authorization,
        'CANCELLED',
      );

      const savedPayment = await prisma.payment.findUnique({
        where: { id: created.id },
      });
      expect(savedPayment!.status).toBe('REFUNDED');
    });

    it('should throw when refunding a non-completed payment', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await service.createPayment(
        userId,
        orderId,
        authorization,
      );

      await expect(
        service.refundPayment(userId, created.id, authorization),
      ).rejects.toThrow();
    });
  });
});
