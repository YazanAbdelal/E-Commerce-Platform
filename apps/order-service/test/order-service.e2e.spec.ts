import 'dotenv/config';

import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  BadGatewayException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { OrderServiceModule } from '../src/order-service.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CartClient } from '../src/clients/cart.client.js';
import { ProductCatalogClient } from '../src/clients/product-catalog.client.js';

describe('Orders API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

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

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Ensure the application connects to the test database.
    process.env.ORDER_DATABASE_URL = testDatabaseUrl;

    const moduleFixture = await Test.createTestingModule({
      imports: [OrderServiceModule],
    })
      .overrideProvider(CartClient)
      .useValue(mockCartClient)
      .overrideProvider(ProductCatalogClient)
      .useValue(mockProductCatalogClient)
      .compile();

    app = moduleFixture.createNestApplication();

    // Match the global validation configuration in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Generate a real JWT using the application's configured JwtService.
    const jwtService = app.get(JwtService);
    token = await jwtService.signAsync({ sub: 1 });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // Clean the test database before each test.
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();

    mockCartClient.getCart.mockReset();
    mockProductCatalogClient.findOne.mockReset();
  });

  describe('Authentication', () => {
    it('should reject requests without an authorization token', async () => {
      await request(app.getHttpServer()).post('/orders').expect(401);
      await request(app.getHttpServer()).get('/orders').expect(401);
      await request(app.getHttpServer()).get('/orders/1').expect(401);
    });

    it('should reject invalid JWTs', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /orders', () => {
    const setupCartAndProducts = () => {
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
    };

    it('should create an order from the authenticated user cart', async () => {
      setupCartAndProducts();

      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.userId).toBe(1);
      expect(response.body.totalAmount).toBe('2025');
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items).toMatchObject([
        { productId: 42, productName: 'Laptop', quantity: 2 },
        { productId: 43, productName: 'Mouse', quantity: 1 },
      ]);
    });

    it('should return 400 when the cart is empty', async () => {
      mockCartClient.getCart.mockResolvedValue({
        id: 1,
        userId: 1,
        items: [],
      });

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should return 502 when the cart service is unavailable', async () => {
      // The real CartClient converts network failures into BadGatewayException.
      mockCartClient.getCart.mockRejectedValue(
        new BadGatewayException('Shopping Cart Service is unavailable'),
      );

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(502);
    });
  });

  describe('GET /orders', () => {
    it('should return all orders for the authenticated user', async () => {
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

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(
        response.body.every((order: { userId: number }) => order.userId === 1),
      ).toBe(true);
    });

    it('should return an empty list when the user has no orders', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /orders/:id', () => {
    it('should return the order when it belongs to the authenticated user', async () => {
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

      const created = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/orders/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.id).toBe(created.body.id);
      expect(response.body.userId).toBe(1);
      expect(response.body.items).toHaveLength(1);
    });

    it('should return 404 when the order does not exist', async () => {
      await request(app.getHttpServer())
        .get('/orders/999999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
