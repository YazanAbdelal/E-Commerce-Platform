import { Test, TestingModule } from '@nestjs/testing';
import { OrderServiceService } from './order-service.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CartClient } from './clients/cart.client.js';
import { ProductCatalogClient } from './clients/product-catalog.client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

describe('OrderServiceService', () => {
  let service: OrderServiceService;

  const mockPrismaService = {
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  const mockCartClient = {
    getCart: vi.fn(),
  };

  const mockProductCatalogClient = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderServiceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CartClient,
          useValue: mockCartClient,
        },
        {
          provide: ProductCatalogClient,
          useValue: mockProductCatalogClient,
        },
      ],
    }).compile();

    service = module.get<OrderServiceService>(OrderServiceService);
  });

  describe('createOrder', () => {
    const userId = 1;
    const token = 'valid-token';

    const cart = {
      id: 1,
      userId: 1,
      items: [
        { productId: 10, quantity: 2 },
        { productId: 20, quantity: 1 },
      ],
    };

    const products = [
      { id: 10, name: 'Laptop', price: 1000 },
      { id: 20, name: 'Mouse', price: 25 },
    ];

    const expectedOrderItems = [
      {
        productId: 10,
        productName: 'Laptop',
        unitPrice: '1000.00',
        quantity: 2,
        lineTotalCents: 200000,
      },
      {
        productId: 20,
        productName: 'Mouse',
        unitPrice: '25.00',
        quantity: 1,
        lineTotalCents: 2500,
      },
    ];

    const expectedOrder = {
      id: 1,
      userId,
      totalAmount: '2025.00',
      items: expectedOrderItems.map(({ lineTotalCents, ...item }) => item),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockCartClient.getCart.mockResolvedValue(cart);
      mockProductCatalogClient.findOne.mockImplementation((id) =>
        Promise.resolve(products.find((product) => product.id === id)!),
      );
      mockPrismaService.order.create.mockResolvedValue(expectedOrder);
    });

    it('should create an order from a non-empty cart', async () => {
      const result = await service.createOrder(userId, token);

      expect(mockCartClient.getCart).toHaveBeenCalledWith(token);
      expect(mockPrismaService.order.create).toHaveBeenCalledWith({
        data: {
          userId,
          totalAmount: '2025.00',
          items: {
            create: expectedOrderItems.map(
              ({ lineTotalCents, ...item }) => item,
            ),
          },
        },
        include: { items: true },
      });
      expect(result).toEqual(expectedOrder);
    });

    it('should throw BadRequestException when the cart is empty', async () => {
      mockCartClient.getCart.mockResolvedValue({ ...cart, items: [] });

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.order.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when the cart belongs to another user', async () => {
      mockCartClient.getCart.mockResolvedValue({ ...cart, userId: 2 });

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadGatewayException,
      );
      expect(mockPrismaService.order.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when product data is invalid', async () => {
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 999,
        name: 'Unknown',
        price: -5,
      });

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadGatewayException,
      );
      expect(mockPrismaService.order.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when the returned product id does not match the cart item', async () => {
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 999,
        name: 'Mismatched Product',
        price: 10,
      });

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should throw BadGatewayException when the returned product price is not finite', async () => {
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 10,
        name: 'Laptop',
        price: NaN,
      });

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should throw BadGatewayException when the cart service is unavailable', async () => {
      // The real CartClient converts network failures into BadGatewayException.
      mockCartClient.getCart.mockRejectedValue(
        new BadGatewayException('Shopping Cart Service is unavailable'),
      );

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadGatewayException,
      );
      expect(mockPrismaService.order.create).not.toHaveBeenCalled();
    });

    it('should propagate a 4xx error returned by the cart service', async () => {
      mockCartClient.getCart.mockRejectedValue(
        new HttpException('Forbidden', 403),
      );

      await expect(service.createOrder(userId, token)).rejects.toMatchObject({
        status: 403,
      });
      expect(mockPrismaService.order.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when the product catalog service returns a server error', async () => {
      // The real ProductCatalogClient converts 5xx responses into BadGatewayException.
      mockCartClient.getCart.mockResolvedValue({
        ...cart,
        items: [{ productId: 10, quantity: 1 }],
      });
      mockProductCatalogClient.findOne.mockRejectedValue(
        new BadGatewayException('Product Catalog Service returned an error'),
      );

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should throw BadRequestException when the order total is too large', async () => {
      mockCartClient.getCart.mockResolvedValue({
        ...cart,
        items: [{ productId: 10, quantity: 1 }],
      });
      mockProductCatalogClient.findOne.mockResolvedValue({
        id: 10,
        name: 'Laptop',
        price: 1e15,
      });

      await expect(service.createOrder(userId, token)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.order.create).not.toHaveBeenCalled();
    });
  });

  describe('getOrders', () => {
    it('should return all orders for a user ordered by creation date', async () => {
      const orders = [
        { id: 2, userId: 1 },
        { id: 1, userId: 1 },
      ];
      mockPrismaService.order.findMany.mockResolvedValue(orders);

      const result = await service.getOrders(1);

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(orders);
    });

    it('should return an empty list when the user has no orders', async () => {
      mockPrismaService.order.findMany.mockResolvedValue([]);

      const result = await service.getOrders(1);

      expect(result).toEqual([]);
    });
  });

  describe('getOrder', () => {
    it('should return the order when it belongs to the user', async () => {
      const order = { id: 1, userId: 1 };
      mockPrismaService.order.findFirst.mockResolvedValue(order);

      const result = await service.getOrder(1, 1);

      expect(mockPrismaService.order.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
        include: { items: true },
      });
      expect(result).toEqual(order);
    });

    it('should throw NotFoundException when the order does not exist', async () => {
      mockPrismaService.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrder(1, 999)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.order.findFirst).toHaveBeenCalledWith({
        where: { id: 999, userId: 1 },
        include: { items: true },
      });
    });

    it('should throw NotFoundException when the order belongs to another user', async () => {
      mockPrismaService.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrder(2, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
