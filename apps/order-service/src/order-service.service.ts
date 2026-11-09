import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service.js';
import { CartClient } from './clients/cart.client.js';
import { ProductCatalogClient } from './clients/product-catalog.client.js';
import { OrderStatus } from './generated/prisma/enums.js';
import type { UpdatableOrderStatus } from './dto/update-order-status.dto.js';

@Injectable()
export class OrderServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartClient: CartClient,
    private readonly productCatalogClient: ProductCatalogClient,
  ) { }

  async createOrder(userId: number, token: string) {
    // 1. Retrieve the user's cart.
    const cart = await this.cartClient.getCart(token);

    if (cart.userId !== userId) {
      throw new BadGatewayException(
        'Shopping Cart Service returned an unexpected user',
      );
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cannot create an order from an empty cart');
    }

    // 2. Retrieve product details for every cart item.
    const products = await Promise.all(
      cart.items.map((item) =>
        this.productCatalogClient.findOne(item.productId),
      ),
    );

    // 3. Build order items using current product information.
    const orderItems = cart.items.map((item, index) => {
      const product = products[index];

      if (
        product.id !== item.productId ||
        !Number.isFinite(product.price) ||
        product.price < 0
      ) {
        throw new BadGatewayException(
          'Product Catalog Service returned invalid product data',
        );
      }

      const unitPriceCents = Math.round(product.price * 100);

      return {
        productId: product.id,
        productName: product.name,
        unitPrice: (unitPriceCents / 100).toFixed(2),
        quantity: item.quantity,
        lineTotalCents: unitPriceCents * item.quantity,
      };
    });

    // 4. Calculate the order total using integer cents.
    const totalCents = orderItems.reduce(
      (total, item) => total + item.lineTotalCents,
      0,
    );

    if (!Number.isSafeInteger(totalCents)) {
      throw new BadRequestException('Order total is too large');
    }

    // 5. Persist the order and its items.
    return this.prisma.order.create({
      data: {
        userId,
        totalAmount: (totalCents / 100).toFixed(2),
        items: {
          create: orderItems.map(
            ({ lineTotalCents, ...item }) => item,
          ),
        },
      },
      include: {
        items: true,
      },
    });
  }

  async getOrders(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(userId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateOrderStatus(
    userId: number,
    orderId: number,
    status: UpdatableOrderStatus,
  ) {
    const order = await this.getOrder(userId, orderId);

    // Treat repeating the same transition as a no-op so callers can safely
    // retry after a network failure.
    if (order.status === status) {
      return order;
    }

    const allowedFrom: Record<UpdatableOrderStatus, OrderStatus[]> = {
      [OrderStatus.CONFIRMED]: [OrderStatus.PENDING],
      [OrderStatus.CANCELLED]: [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
      ],
    };

    const fromStatuses = allowedFrom[status];

    // Guard here as well so the service stays correct even when it is called
    // without the HTTP validation pipe (for example from another service).
    if (!fromStatuses) {
      throw new BadRequestException(`Unsupported order status: ${status}`);
    }

    if (!fromStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Cannot change order status from ${order.status} to ${status}`,
      );
    }

    const result = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        userId,
        status: { in: fromStatuses },
      },
      data: { status },
    });

    if (result.count === 0) {
      // Another request may have changed the status concurrently.
      const current = await this.getOrder(userId, orderId);

      if (current.status === status) {
        return current;
      }

      throw new BadRequestException(
        `Cannot change order status from ${current.status} to ${status}`,
      );
    }

    return this.getOrder(userId, orderId);
  }
}