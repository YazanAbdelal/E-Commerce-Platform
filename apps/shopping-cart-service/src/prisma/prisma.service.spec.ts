import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn() }));
vi.mock('../generated/prisma/client.js', () => {
  interface MockPrismaInstance {
    $connect: () => Promise<void>;
    $disconnect: () => Promise<void>;
  }

  const PrismaClient = vi.fn(function PrismaClient(this: MockPrismaInstance) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
  });
  return { PrismaClient };
});

const MockPrismaClient = vi.mocked(PrismaClient);
const MockPrismaPg = vi.mocked(PrismaPg);

const ORIGINAL_ENV = process.env;

describe('PrismaService (shopping-cart-service)', () => {
  beforeEach(() => {
    MockPrismaPg.mockClear();
    MockPrismaClient.mockClear();
    process.env = { ...ORIGINAL_ENV };
    process.env.CART_DATABASE_URL =
      'postgresql://ecommerce:ecommerce_dev@localhost:5432/shopping_cart_test';
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('should create the postgres adapter from the app database URL and connect/disconnect', async () => {
    const service = new PrismaService();

    expect(MockPrismaPg).toHaveBeenCalledTimes(1);
    expect(MockPrismaPg.mock.calls[0][0].connectionString).toBe(
      'postgresql://ecommerce:ecommerce_dev@localhost:5432/shopping_cart_test',
    );
    expect(MockPrismaClient).toHaveBeenCalledTimes(1);

    await service.onModuleInit();
    const instance = MockPrismaClient.mock.instances[0];
    expect(instance.$connect.mock.calls).toHaveLength(1);

    await service.onModuleDestroy();
    expect(instance.$disconnect.mock.calls).toHaveLength(1);
  });
});
