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

import { ApiGatewayModule } from '../src/api-gateway.module.js';
import { CartClient } from '../src/clients/cart.client.js';
import { OrderClient } from '../src/clients/order.client.js';
import { PaymentClient } from '../src/clients/payment.client.js';
import { ProductCatalogClient } from '../src/clients/product-catalog.client.js';
import { UserClient } from '../src/clients/user.client.js';

describe('API gateway (e2e)', () => {
    let app: INestApplication;
    let accessToken: string;
    let adminToken: string;

    const mockCartClient = {
        getCart: vi.fn(),
        addItem: vi.fn(),
        updateItem: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
    };

    const mockOrderClient = {
        createOrder: vi.fn(),
        getOrders: vi.fn(),
        getOrder: vi.fn(),
    };

    const mockPaymentClient = {
        createPayment: vi.fn(),
        getPayments: vi.fn(),
        getPayment: vi.fn(),
        capturePayment: vi.fn(),
        refundPayment: vi.fn(),
    };

    const mockProductCatalogClient = {
        findAll: vi.fn(),
        findOne: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    };

    const mockUserClient = {
        register: vi.fn(),
        login: vi.fn(),
        findOne: vi.fn(),
        updateOne: vi.fn(),
    };

    beforeAll(async () => {
        process.env.JWT_SECRET ??= 'e2e-gateway-secret-at-least-32-characters';

        const moduleRef = await Test.createTestingModule({
            imports: [ApiGatewayModule],
        })
            .overrideProvider(CartClient)
            .useValue(mockCartClient)
            .overrideProvider(OrderClient)
            .useValue(mockOrderClient)
            .overrideProvider(PaymentClient)
            .useValue(mockPaymentClient)
            .overrideProvider(ProductCatalogClient)
            .useValue(mockProductCatalogClient)
            .overrideProvider(UserClient)
            .useValue(mockUserClient)
            .compile();

        app = moduleRef.createNestApplication({ logger: false });
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        await app.init();

        const jwtService = app.get(JwtService);
        accessToken = await jwtService.signAsync({
            sub: 7,
            email: 'customer@example.com',
            role: 'CUSTOMER',
        });
        adminToken = await jwtService.signAsync({
            sub: 1,
            email: 'admin@example.com',
            role: 'ADMIN',
        });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();

        mockCartClient.getCart.mockResolvedValue({ userId: 7, items: [] });
        mockCartClient.addItem.mockResolvedValue({ items: [] });
        mockCartClient.updateItem.mockResolvedValue({ items: [] });
        mockCartClient.removeItem.mockResolvedValue({ items: [] });
        mockCartClient.clearCart.mockResolvedValue({ deletedItems: 0 });

        mockOrderClient.createOrder.mockResolvedValue({ id: 1, status: 'PENDING' });
        mockOrderClient.getOrders.mockResolvedValue([]);
        mockOrderClient.getOrder.mockResolvedValue({ id: 1 });

        mockPaymentClient.createPayment.mockResolvedValue({ id: 5, status: 'PENDING' });
        mockPaymentClient.getPayments.mockResolvedValue([]);
        mockPaymentClient.getPayment.mockResolvedValue({ id: 5 });
        mockPaymentClient.capturePayment.mockResolvedValue({ id: 5, status: 'COMPLETED' });
        mockPaymentClient.refundPayment.mockResolvedValue({ id: 5, status: 'REFUNDED' });

        mockProductCatalogClient.findAll.mockResolvedValue({ data: [], meta: {} });
        mockProductCatalogClient.findOne.mockResolvedValue({ id: 42 });
        mockProductCatalogClient.create.mockResolvedValue({ id: 43 });
        mockProductCatalogClient.update.mockResolvedValue({ id: 43 });
        mockProductCatalogClient.remove.mockResolvedValue({ message: 'deleted' });

        mockUserClient.register.mockResolvedValue({ id: 9, email: 'new@example.com' });
        mockUserClient.login.mockResolvedValue({ access_token: 'downstream-token' });
        mockUserClient.findOne.mockResolvedValue({ id: 7 });
        mockUserClient.updateOne.mockResolvedValue({ id: 7 });
    });

    it('should serve the root greeting and echo a request id', async () => {
        const response = await request(app.getHttpServer()).get('/').expect(200);

        expect(response.text).toBe('Hello World!');
        expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('should proxy login and expose the profile for a valid token', async () => {
        const login = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'a@b.com', password: 'password123' })
            .expect(201);

        expect(login.body).toEqual({ access_token: 'downstream-token' });
        expect(mockUserClient.login).toHaveBeenCalledWith(
            { email: 'a@b.com', password: 'password123' },
            expect.any(String),
        );

        const profile = await request(app.getHttpServer())
            .get('/auth/profile')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(profile.body).toMatchObject({ sub: 7, role: 'CUSTOMER' });
    });

    it('should reject a protected route without a token', async () => {
        await request(app.getHttpServer()).get('/cart').expect(401);
        expect(mockCartClient.getCart).not.toHaveBeenCalled();
    });

    it('should reject a malformed token', async () => {
        await request(app.getHttpServer())
            .get('/cart')
            .set('Authorization', 'Bearer not-a-jwt')
            .expect(401);
    });

    it('should proxy the public product reads', async () => {
        await request(app.getHttpServer())
            .get('/products?page=2&search=lap')
            .expect(200);

        expect(mockProductCatalogClient.findAll).toHaveBeenCalledWith(
            { page: '2', search: 'lap' },
            expect.any(String),
        );

        await request(app.getHttpServer()).get('/products/42').expect(200);
        expect(mockProductCatalogClient.findOne).toHaveBeenCalledWith(
            42,
            expect.any(String),
        );
    });

    it('should require an admin role for product writes', async () => {
        await request(app.getHttpServer())
            .post('/products')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ name: 'Laptop', price: 1000 })
            .expect(403);

        expect(mockProductCatalogClient.create).not.toHaveBeenCalled();

        await request(app.getHttpServer())
            .post('/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Laptop', price: 1000 })
            .expect(201);

        expect(mockProductCatalogClient.create).toHaveBeenCalledWith(
            { name: 'Laptop', price: 1000 },
            expect.any(String),
        );

        await request(app.getHttpServer())
            .patch('/products/42')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ price: 900 })
            .expect(200);

        expect(mockProductCatalogClient.update).toHaveBeenCalledWith(
            '42',
            { price: 900 },
            expect.any(String),
        );

        await request(app.getHttpServer())
            .delete('/products/42')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(mockProductCatalogClient.remove).toHaveBeenCalledWith(
            '42',
            expect.any(String),
        );
    });

    it('should proxy every cart route', async () => {
        const auth = `Bearer ${accessToken}`;

        await request(app.getHttpServer())
            .get('/cart')
            .set('Authorization', auth)
            .expect(200);
        expect(mockCartClient.getCart).toHaveBeenCalledWith(auth, expect.any(String));

        await request(app.getHttpServer())
            .post('/cart/items')
            .set('Authorization', auth)
            .send({ productId: 42, quantity: 2 })
            .expect(201);
        expect(mockCartClient.addItem).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            { productId: 42, quantity: 2 },
        );

        await request(app.getHttpServer())
            .patch('/cart/items/42')
            .set('Authorization', auth)
            .send({ quantity: 5 })
            .expect(200);
        expect(mockCartClient.updateItem).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            42,
            { quantity: 5 },
        );

        await request(app.getHttpServer())
            .delete('/cart/items/42')
            .set('Authorization', auth)
            .expect(200);
        expect(mockCartClient.removeItem).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            42,
        );

        await request(app.getHttpServer())
            .delete('/cart')
            .set('Authorization', auth)
            .expect(200);
        expect(mockCartClient.clearCart).toHaveBeenCalledWith(auth, expect.any(String));
    });

    it('should refuse a non-numeric cart item id', async () => {
        await request(app.getHttpServer())
            .patch('/cart/items/not-a-number')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ quantity: 5 })
            .expect(400);
    });

    it('should proxy every order route', async () => {
        const auth = `Bearer ${accessToken}`;

        await request(app.getHttpServer())
            .post('/orders')
            .set('Authorization', auth)
            .expect(201);

        await request(app.getHttpServer())
            .get('/orders')
            .set('Authorization', auth)
            .expect(200);

        await request(app.getHttpServer())
            .get('/orders/12')
            .set('Authorization', auth)
            .expect(200);

        expect(mockOrderClient.createOrder).toHaveBeenCalledWith(auth, expect.any(String));
        expect(mockOrderClient.getOrders).toHaveBeenCalledWith(auth, expect.any(String));
        expect(mockOrderClient.getOrder).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            12,
        );
    });

    it('should proxy payments, forwarding the idempotency key', async () => {
        const auth = `Bearer ${accessToken}`;

        await request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', auth)
            .set('Idempotency-Key', 'checkout-123')
            .send({ orderId: 1 })
            .expect(201);

        expect(mockPaymentClient.createPayment).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            1,
            'checkout-123',
        );

        await request(app.getHttpServer())
            .get('/payments')
            .set('Authorization', auth)
            .expect(200);

        await request(app.getHttpServer())
            .get('/payments/5')
            .set('Authorization', auth)
            .expect(200);

        await request(app.getHttpServer())
            .post('/payments/5/capture')
            .set('Authorization', auth)
            .expect(200);

        await request(app.getHttpServer())
            .post('/payments/5/refund')
            .set('Authorization', auth)
            .expect(200);

        expect(mockPaymentClient.getPayments).toHaveBeenCalledWith(auth, expect.any(String));
        expect(mockPaymentClient.getPayment).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            5,
        );
        expect(mockPaymentClient.capturePayment).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            5,
        );
        expect(mockPaymentClient.refundPayment).toHaveBeenCalledWith(
            auth,
            expect.any(String),
            5,
        );
    });

    it('should reject an invalid payment body', async () => {
        await request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ orderId: 0 })
            .expect(400);

        expect(mockPaymentClient.createPayment).not.toHaveBeenCalled();
    });

    it('should proxy user registration, owner reads and self updates', async () => {
        await request(app.getHttpServer())
            .post('/users')
            .send({ email: 'new@example.com', password: 'password123' })
            .expect(201);

        const auth = `Bearer ${accessToken}`;

        await request(app.getHttpServer())
            .get('/users/7')
            .set('Authorization', auth)
            .expect(200);
        expect(mockUserClient.findOne).toHaveBeenCalledWith(7, expect.any(String));

        await request(app.getHttpServer())
            .get('/users/8')
            .set('Authorization', auth)
            .expect(403);

        await request(app.getHttpServer())
            .get('/users/8')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        await request(app.getHttpServer())
            .patch('/users/me')
            .set('Authorization', auth)
            .send({ email: 'updated@example.com' })
            .expect(200);
        expect(mockUserClient.updateOne).toHaveBeenCalledWith(
            7,
            { email: 'updated@example.com' },
            expect.any(String),
        );
    });

    it('should expose prometheus metrics', async () => {
        const response = await request(app.getHttpServer())
            .get('/metrics')
            .expect(200);

        expect(response.text).toContain('http_requests_total');
    });
});
