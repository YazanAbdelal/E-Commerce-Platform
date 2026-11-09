import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service.js';
import { CartClient } from './clients/cart.client.js';
import { ProductCatalogClient } from './clients/product-catalog.client.js';

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
}