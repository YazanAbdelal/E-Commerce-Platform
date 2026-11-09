import 'dotenv/config';

import { Test } from '@nestjs/testing';
import {
  BadGatewayException,
  INestApplication,
  ValidationPipe,
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

import { PaymentServiceModule } from '../src/payment-service.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrderClient } from '../src/clients/order.client.js';

describe('Payments API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const mockOrderClient = {
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
  };

  const mockOrder = {
    id: 10,
    userId: 1,
    totalAmount: '99.99',
    status: 'PENDING',
  };

  beforeAll(async () => {
    const testDatabaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error('PAYMENT_TEST_DATABASE_URL is not configured');
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    process.env.PAYMENT_DATABASE_URL = testDatabaseUrl;

    const moduleFixture = await Test.createTestingModule({
      imports: [PaymentServiceModule],
    })
      .overrideProvider(OrderClient)
      .useValue(mockOrderClient)
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
    await prisma.payment.deleteMany();
    mockOrderClient.getOrder.mockReset();
    mockOrderClient.updateOrderStatus.mockReset();
    mockOrderClient.updateOrderStatus.mockResolvedValue(mockOrder);
  });

  describe('Authentication', () => {
    it('should reject requests without an authorization token', async () => {
      await request(app.getHttpServer()).post('/payments').expect(401);
      await request(app.getHttpServer()).get('/payments').expect(401);
      await request(app.getHttpServer()).get('/payments/1').expect(401);
    });

    it('should reject invalid JWTs', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /payments', () => {
    beforeEach(() => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);
    });

    it('should create a payment using the order total', async () => {
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.userId).toBe(1);
      expect(response.body.orderId).toBe(10);
      expect(Number(response.body.amount)).toBe(99.99);
      expect(response.body.status).toBe('PENDING');
    });

    it('should return 400 when the order id is invalid', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 0 })
        .expect(400);
    });

    it('should reject a client-supplied amount', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10, amount: 1 })
        .expect(400);
    });

    it('should return 400 when the order is not payable', async () => {
      mockOrderClient.getOrder.mockResolvedValue({
        ...mockOrder,
        status: 'CANCELLED',
      });

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(400);
    });

    it('should return 400 when a payment already exists for the order', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(400);
    });

    it('should return the same payment for a repeated idempotency key', async () => {
      const first = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'checkout-key')
        .send({ orderId: 10 })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'checkout-key')
        .send({ orderId: 10 })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.payment.count()).toBe(1);
    });

    it('should return 502 when the order service is unavailable', async () => {
      // The real OrderClient converts network failures into BadGatewayException.
      mockOrderClient.getOrder.mockRejectedValue(
        new BadGatewayException('Order Service is unavailable'),
      );

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 999 })
        .expect(502);
    });
  });

  describe('GET /payments', () => {
    it('should return all payments for the authenticated user', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 11 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(
        response.body.every((payment: { userId: number }) => payment.userId === 1),
      ).toBe(true);
    });

    it('should return an empty list when the user has no payments', async () => {
      const response = await request(app.getHttpServer())
        .get('/payments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /payments/:id', () => {
    it('should return the payment when it belongs to the authenticated user', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/payments/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.id).toBe(created.body.id);
      expect(response.body.userId).toBe(1);
    });

    it('should return 404 when the payment does not exist', async () => {
      await request(app.getHttpServer())
        .get('/payments/999999999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('POST /payments/:id/capture', () => {
    it('should capture a pending payment and confirm the order', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/payments/${created.body.id}/capture`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('COMPLETED');
      expect(response.body.providerPaymentId).toBeDefined();
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        10,
        `Bearer ${token}`,
        'CONFIRMED',
      );
    });

    it('should re-sync the order when capturing an already completed payment', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/payments/${created.body.id}/capture`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      mockOrderClient.updateOrderStatus.mockClear();

      const response = await request(app.getHttpServer())
        .post(`/payments/${created.body.id}/capture`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('COMPLETED');
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        10,
        `Bearer ${token}`,
        'CONFIRMED',
      );
    });
  });

  describe('POST /payments/:id/refund', () => {
    it('should refund a completed payment and cancel the order', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/payments/${created.body.id}/capture`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      mockOrderClient.updateOrderStatus.mockClear();

      const response = await request(app.getHttpServer())
        .post(`/payments/${created.body.id}/refund`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('REFUNDED');
      expect(mockOrderClient.updateOrderStatus).toHaveBeenCalledWith(
        10,
        `Bearer ${token}`,
        'CANCELLED',
      );
    });

    it('should return 400 when refunding a non-completed payment', async () => {
      mockOrderClient.getOrder.mockResolvedValue(mockOrder);

      const created = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/payments/${created.body.id}/refund`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });
});
