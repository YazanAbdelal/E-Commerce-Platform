import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service.js';
import { OrderClient } from './clients/order.client.js';
import type { OrderStatusUpdate } from './clients/order.client.js';
import { Prisma } from './generated/prisma/client.js';

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

@Injectable()
export class PaymentServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderClient: OrderClient,
  ) { }

  async createPayment(
    userId: number,
    orderId: number,
    authorization: string,
    idempotencyKey?: string,
  ) {
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      throw new BadRequestException('Invalid order ID');
    }

    const key = idempotencyKey?.trim();

    if (
      key !== undefined &&
      (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH)
    ) {
      throw new BadRequestException('Invalid Idempotency-Key');
    }

    if (key) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: key },
      });

      if (existing) {
        this.assertSamePayment(existing, userId, orderId);
        return existing;
      }
    }

    // Verify the order exists and belongs to the user via the order service.
    // The order service authenticates the request with the caller's JWT, so
    // forward it instead of trusting a client-supplied user id.
    let order: Awaited<ReturnType<OrderClient['getOrder']>>;

    try {
      order = await this.orderClient.getOrder(orderId, authorization);
    } catch (error) {
      // Preserve meaningful downstream responses (for example 404/403) while
      // reporting unexpected failures as an unavailable dependency.
      if (error instanceof HttpException) {
        throw error;
      }

      throw new BadGatewayException('Order Service is unavailable');
    }

    if (order.userId !== userId) {
      throw new BadGatewayException(
        'Order Service returned an unexpected user',
      );
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Order is ${order.status.toLowerCase()} and cannot be paid`,
      );
    }

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (existingPayment) {
      throw new BadRequestException('A payment already exists for this order');
    }

    // The amount always comes from the order, never from the client.
    const amount = order.totalAmount;

    try {
      return await this.prisma.payment.create({
        data: {
          userId,
          orderId,
          idempotencyKey: key,
          amount,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // A concurrent retry with the same key won the race.
        if (key) {
          const existing = await this.prisma.payment.findUnique({
            where: { idempotencyKey: key },
          });

          if (existing) {
            this.assertSamePayment(existing, userId, orderId);
            return existing;
          }
        }

        throw new BadRequestException(
          'A payment already exists for this order',
        );
      }

      throw error;
    }
  }

  async getPayments(userId: number) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayment(userId: number, paymentId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async capturePayment(
    userId: number,
    paymentId: number,
    authorization: string,
  ) {
    const payment = await this.getPayment(userId, paymentId);

    if (payment.status === 'COMPLETED') {
      // Re-sync the order so retries can heal a previous partial failure.
      await this.updateOrderStatus(
        payment.orderId,
        authorization,
        'CONFIRMED',
      );

      return payment;
    }

    if (payment.status !== 'PENDING') {
      throw new BadRequestException(
        `Payment is already ${payment.status.toLowerCase()}`,
      );
    }

    // Simulate a payment provider call. In production, this would call Stripe/PayPal/etc.
    const providerPaymentId = `prov_${Date.now()}`;

    const result = await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        userId,
        status: 'PENDING',
      },
      data: {
        status: 'COMPLETED',
        providerPaymentId,
      },
    });

    if (result.count === 0) {
      const current = await this.getPayment(userId, paymentId);

      if (current.status === 'COMPLETED') {
        await this.updateOrderStatus(
          current.orderId,
          authorization,
          'CONFIRMED',
        );

        return current;
      }

      throw new BadRequestException(
        `Payment is already ${current.status.toLowerCase()}`,
      );
    }

    const completed = await this.getPayment(userId, paymentId);
    await this.updateOrderStatus(
      completed.orderId,
      authorization,
      'CONFIRMED',
    );

    return completed;
  }

  async refundPayment(
    userId: number,
    paymentId: number,
    authorization: string,
  ) {
    const payment = await this.getPayment(userId, paymentId);

    if (payment.status === 'REFUNDED') {
      // Re-sync the order so retries can heal a previous partial failure.
      await this.updateOrderStatus(
        payment.orderId,
        authorization,
        'CANCELLED',
      );

      return payment;
    }

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    const result = await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        userId,
        status: 'COMPLETED',
      },
      data: {
        status: 'REFUNDED',
      },
    });

    if (result.count === 0) {
      const current = await this.getPayment(userId, paymentId);

      if (current.status === 'REFUNDED') {
        await this.updateOrderStatus(
          current.orderId,
          authorization,
          'CANCELLED',
        );

        return current;
      }

      throw new BadRequestException(
        `Payment is already ${current.status.toLowerCase()}`,
      );
    }

    const refunded = await this.getPayment(userId, paymentId);
    await this.updateOrderStatus(
      refunded.orderId,
      authorization,
      'CANCELLED',
    );

    return refunded;
  }

  private assertSamePayment(
    payment: { userId: number; orderId: number },
    userId: number,
    orderId: number,
  ) {
    if (payment.userId !== userId || payment.orderId !== orderId) {
      throw new ConflictException(
        'Idempotency key was already used for a different payment',
      );
    }
  }

  private async updateOrderStatus(
    orderId: number,
    authorization: string,
    status: OrderStatusUpdate,
  ) {
    try {
      await this.orderClient.updateOrderStatus(
        orderId,
        authorization,
        status,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new BadGatewayException('Order Service is unavailable');
    }
  }
}
