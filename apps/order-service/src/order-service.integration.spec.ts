import 'dotenv/config';

import { Test } from '@nestjs/testing';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { OrderServiceService } from './order-service.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CartClient } from './clients/cart.client.js';
import { ProductCatalogClient } from './clients/product-catalog.client.js';

describe('OrderServiceService integration', () => {
  let prisma: PrismaService;
  let service: OrderServiceService;

  const userId = 1;
  const token = 'valid-token';

  const mockCartClient = {
    getCart: vi.fn(),
  };
  const mockProductCatalogClient = {
    findOne: vi.fn(),
  };

  beforeAll(async () => {
    const testDatabaseUrl = process.env.ORDER_TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error('ORDER_TEST_DATABASE_URL is not configured');
    }

    // Make PrismaService connect to the test database.
    process.env.ORDER_DATABASE_URL = testDatabaseUrl;

    prisma = new PrismaService();
    await prisma.$connect();

    service = new OrderServiceService(
      prisma,
      mockCartClient as unknown as CartClient,
      mockProductCatalogClient as unknown as ProductCatalogClient,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    // Clean the tables used by the tests before every test.
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();

    mockCartClient.getCart.mockReset();
    mockProductCatalogClient.findOne.mockReset();
  });

  describe('createOrder', () => {
    it('should persist an order and its items with the correct total', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [
          { productId: 42, quantity: 2 },
          { productId: 43, quantity: 1 },
        ],
      });
      mockProductCatalogClient.findOne.mockImplementation((id) => {
        if (id === 42) {
          return Promise.resolve({ id: 42, name: 'Laptop', price: 1000 });
        }
        return Promise.resolve({ id: 43, name: 'Mouse', price: 25 });
      });

      const order = await service.createOrder(userId, token);

      expect(order.id).toBeDefined();
      expect(order.userId).toBe(userId);
      expect(Number(order.totalAmount)).toBe(2025);
      expect(order.items).toHaveLength(2);
      expect(order.items).toMatchObject([
        { productId: 42, productName: 'Laptop', quantity: 2 },
        { productId: 43, productName: 'Mouse', quantity: 1 },
      ]);

      // Verify the order was actually persisted in PostgreSQL.
      const savedOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      expect(savedOrder).not.toBeNull();
      expect(Number(savedOrder!.totalAmount)).toBe(2025);
      expect(savedOrder?.items).toHaveLength(2);
    });

    it('should not persist anything when the cart is empty', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [],
      });

      await expect(service.createOrder(userId, token)).rejects.toThrow();

      const orderCount = await prisma.order.count();
      expect(orderCount).toBe(0);
    });

    it('should not persist anything when the cart belongs to another user', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 2,
        items: [{ productId: 42, quantity: 1 }],
      });

      await expect(service.createOrder(userId, token)).rejects.toThrow();

      const orderCount = await prisma.order.count();
      expect(orderCount).toBe(0);
    });
  });

  describe('getOrders', () => {
    it('should return all orders for a user from the database', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [{ productId: 42, quantity: 1 }],
      });
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 42,
        name: 'Laptop',
        price: 1000,
      });

      await service.createOrder(userId, token);
      await service.createOrder(userId, token);

      const orders = await service.getOrders(userId);

      expect(orders).toHaveLength(2);
      expect(orders[0].id).toBeGreaterThanOrEqual(orders[1]?.id ?? 0);
      expect(orders.every((order) => order.userId)).toBe(true);
    });

    it('should return an empty list when the user has no orders', async () => {
      const orders = await service.getOrders(999);

      expect(orders).toEqual([]);
    });
  });

  describe('getOrder', () => {
    it('should return the order when it belongs to the user', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [{ productId: 42, quantity: 1 }],
      });
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 42,
        name: 'Laptop',
        price: 1000,
      });

      const created = await service.createOrder(userId, token);

      const order = await service.getOrder(userId, created.id);

      expect(order.id).toBe(created.id);
      expect(order.userId).toBe(userId);
      expect(order.items).toHaveLength(1);
    });

    it('should throw when the order does not exist', async () => {
      await expect(service.getOrder(userId, 999999999)).rejects.toThrow();
    });

    it('should throw when the order belongs to another user', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [{ productId: 42, quantity: 1 }],
      });
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 42,
        name: 'Laptop',
        price: 1000,
      });

      const created = await service.createOrder(userId, token);

      await expect(service.getOrder(2, created.id)).rejects.toThrow();
    });
  });

  describe('updateOrderStatus', () => {
    const createOrder = async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [{ productId: 42, quantity: 1 }],
      });
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 42,
        name: 'Laptop',
        price: 1000,
      });

      return service.createOrder(userId, token);
    };

    it('should confirm a pending order in the database', async () => {
      const created = await createOrder();

      const confirmed = await service.updateOrderStatus(
        userId,
        created.id,
        'CONFIRMED',
      );

      expect(confirmed.status).toBe('CONFIRMED');

      const saved = await prisma.order.findUnique({
        where: { id: created.id },
      });
      expect(saved!.status).toBe('CONFIRMED');
    });

    it('should treat confirming an already confirmed order as a no-op', async () => {
      const created = await createOrder();
      await service.updateOrderStatus(userId, created.id, 'CONFIRMED');

      const confirmed = await service.updateOrderStatus(
        userId,
        created.id,
        'CONFIRMED',
      );

      expect(confirmed.status).toBe('CONFIRMED');
    });

    it('should cancel a confirmed order in the database', async () => {
      const created = await createOrder();
      await service.updateOrderStatus(userId, created.id, 'CONFIRMED');

      const cancelled = await service.updateOrderStatus(
        userId,
        created.id,
        'CANCELLED',
      );

      expect(cancelled.status).toBe('CANCELLED');

      const saved = await prisma.order.findUnique({
        where: { id: created.id },
      });
      expect(saved!.status).toBe('CANCELLED');
    });

    it('should reject an invalid status transition', async () => {
      const created = await createOrder();
      await service.updateOrderStatus(userId, created.id, 'CANCELLED');

      await expect(
        service.updateOrderStatus(userId, created.id, 'CONFIRMED'),
      ).rejects.toThrow();
    });

    it('should throw when the order does not exist', async () => {
      await expect(
        service.updateOrderStatus(userId, 999999999, 'CONFIRMED'),
      ).rejects.toThrow();
    });

    it('should throw when the order belongs to another user', async () => {
      const created = await createOrder();

      await expect(
        service.updateOrderStatus(2, created.id, 'CONFIRMED'),
      ).rejects.toThrow();
    });
  });
});
