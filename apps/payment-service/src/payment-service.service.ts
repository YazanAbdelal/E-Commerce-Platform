import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service.js';
import { OrderClient } from './clients/order.client.js';

@Injectable()
export class PaymentServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderClient: OrderClient,
  ) { }

  async createPayment(
    userId: number,
    orderId: number,
    amount: number,
    authorization: string,
  ) {
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      throw new BadRequestException('Invalid order ID');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid payment amount');
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

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (existingPayment) {
      throw new BadRequestException('A payment already exists for this order');
    }

    return this.prisma.payment.create({
      data: {
        userId,
        orderId,
        amount,
        status: 'PENDING',
      },
    });
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

  async capturePayment(userId: number, paymentId: number) {
    const payment = await this.getPayment(userId, paymentId);

    if (payment.status !== 'PENDING') {
      throw new BadRequestException(
        `Payment is already ${payment.status.toLowerCase()}`,
      );
    }

    // Simulate a payment provider call. In production, this would call Stripe/PayPal/etc.
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        providerPaymentId: `prov_${Date.now()}`,
      },
    });
  }

  async refundPayment(userId: number, paymentId: number) {
    const payment = await this.getPayment(userId, paymentId);

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REFUNDED',
      },
    });
  }
}
