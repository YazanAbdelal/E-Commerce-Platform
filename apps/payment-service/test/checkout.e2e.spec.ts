import 'dotenv/config';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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

import { OrderServiceModule } from '../../order-service/src/order-service.module.js';
import { CartClient } from '../../order-service/src/clients/cart.client.js';
import { ProductCatalogClient } from '../../order-service/src/clients/product-catalog.client.js';
import { PrismaService as OrderPrismaService } from '../../order-service/src/prisma/prisma.service.js';
import { PaymentServiceModule } from '../src/payment-service.module.js';
import { PrismaService as PaymentPrismaService } from '../src/prisma/prisma.service.js';

describe('Checkout flow (e2e)', () => {
  let orderApp: INestApplication;
  let paymentApp: INestApplication;
  let orderPrisma: OrderPrismaService;
  let paymentPrisma: PaymentPrismaService;
  let token: string;

  const mockCartClient = {
    getCart: vi.fn(),
  };
  const mockProductCatalogClient = {
    findOne: vi.fn(),
  };

  beforeAll(async () => {
    const orderDatabaseUrl = process.env.ORDER_TEST_DATABASE_URL;
    const paymentDatabaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;

    if (!orderDatabaseUrl) {
      throw new Error('ORDER_TEST_DATABASE_URL is not configured');
    }

    if (!paymentDatabaseUrl) {
      throw new Error('PAYMENT_TEST_DATABASE_URL is not configured');
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    process.env.ORDER_DATABASE_URL = orderDatabaseUrl;
    process.env.PAYMENT_DATABASE_URL = paymentDatabaseUrl;

    const orderModule = await Test.createTestingModule({
      imports: [OrderServiceModule],
    })
      .overrideProvider(CartClient)
      .useValue(mockCartClient)
      .overrideProvider(ProductCatalogClient)
      .useValue(mockProductCatalogClient)
      .compile();

    orderApp = orderModule.createNestApplication();
    orderApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await orderApp.init();
    await orderApp.listen(0);

    const orderAddress = orderApp.getHttpServer().address();

    if (!orderAddress || typeof orderAddress === 'string') {
      throw new Error('Could not determine the order service port');
    }

    // The payment service calls the order service over real HTTP.
    process.env.ORDER_SERVICE_URL =
      `http://127.0.0.1:${orderAddress.port}`;

    const paymentModule = await Test.createTestingModule({
      imports: [PaymentServiceModule],
    }).compile();

    paymentApp = paymentModule.createNestApplication();
    paymentApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await paymentApp.init();

    orderPrisma = orderApp.get<OrderPrismaService>(OrderPrismaService);
    paymentPrisma = paymentApp.get<PaymentPrismaService>(
      PaymentPrismaService,
    );

    const jwtService = orderApp.get(JwtService);
    token = await jwtService.signAsync({ sub: 1 });
  });

  afterAll(async () => {
    await paymentApp?.close();
    await orderApp?.close();
  });

  beforeEach(async () => {
    await paymentPrisma.payment.deleteMany();
    await orderPrisma.orderItem.deleteMany();
    await orderPrisma.order.deleteMany();

    mockCartClient.getCart.mockReset();
    mockProductCatalogClient.findOne.mockReset();
  });

  it('should create an order, pay it, confirm it, refund it and cancel it', async () => {
    mockCartClient.getCart.mockResolvedValue({
      id: 1,
      userId: 1,
      items: [{ productId: 42, quantity: 2 }],
    });
    mockProductCatalogClient.findOne.mockResolvedValue({
      id: 42,
      name: 'Laptop',
      price: 1000,
    });

    const orderResponse = await request(orderApp.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const orderId = orderResponse.body.id;

    expect(orderResponse.body.status).toBe('PENDING');
    expect(Number(orderResponse.body.totalAmount)).toBe(2000);

    const paymentResponse = await request(paymentApp.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'checkout-flow-key')
      .send({ orderId })
      .expect(201);

    const paymentId = paymentResponse.body.id;

    expect(Number(paymentResponse.body.amount)).toBe(2000);
    expect(paymentResponse.body.status).toBe('PENDING');

    // A retry with the same key must not create a second payment.
    const retryResponse = await request(paymentApp.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'checkout-flow-key')
      .send({ orderId })
      .expect(201);

    expect(retryResponse.body.id).toBe(paymentId);

    const captureResponse = await request(paymentApp.getHttpServer())
      .post(`/payments/${paymentId}/capture`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(captureResponse.body.status).toBe('COMPLETED');

    const paidOrder = await request(orderApp.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(paidOrder.body.status).toBe('CONFIRMED');

    const refundResponse = await request(paymentApp.getHttpServer())
      .post(`/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(refundResponse.body.status).toBe('REFUNDED');

    const refundedOrder = await request(orderApp.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(refundedOrder.body.status).toBe('CANCELLED');
  });
});
