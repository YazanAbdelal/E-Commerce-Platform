import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockPrismaService = {
    $transaction: vi.fn(),
    product: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined.', () => {
    expect(service).toBeDefined();
  })

  it('should return paginated products.', async () => {
    const products = [
      { id: 1, name: 'Laptop', price: 1200 },
      { id: 2, name: 'Mouse', price: 30 },
    ];

    const query = {
      page: 1,
      limit: 10,
      sortBy: 'name' as const,
      order: 'asc' as const,
    };

    mockPrismaService.product.findMany.mockResolvedValue(products);
    mockPrismaService.product.count.mockResolvedValue(2);

    mockPrismaService.$transaction.mockResolvedValue([products, 2]);

    const result = await service.findAll(query);

    expect(result).toEqual({
      data: products,
      meta: {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });

    expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
      where: {},
      skip: 0,
      take: 10,
      orderBy: {
        name: 'asc',
      },
    });

    expect(mockPrismaService.product.count).toHaveBeenCalledWith({
      where: {},
    });

    expect(mockPrismaService.$transaction).toHaveBeenCalledOnce();
  });

  it('should return a product by ID', async () => {
    const product = { id: 1, name: 'Laptop', price: 1200 };

    mockPrismaService.product.findUnique.mockResolvedValue(product);

    const result = await service.findOne(1);

    expect(result).toEqual(product);
    expect(mockPrismaService.product.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  })

  it('should throw NotFoundException if product does not exist', async () => {
    mockPrismaService.product.findUnique.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  })

  it('should create a product', async () => {
    const createProductDto = {
      name: 'Keyboard',
      price: 80,
    };

    const createdProduct = {
      id: 3,
      ...createProductDto,
    };

    mockPrismaService.product.create.mockResolvedValue(createdProduct);

    const result = await service.create(createProductDto);

    expect(result).toEqual(createdProduct);
    expect(mockPrismaService.product.create).toHaveBeenCalledWith({
      data: createProductDto,
    });
  });

  it('should update a product', async () => {
    const existingProduct = {
      id: 1,
      name: 'Laptop',
      price: 1200,
    };

    const updateProductDto = {
      price: 1000,
    };

    const updatedProduct = {
      ...existingProduct,
      ...updateProductDto,
    };

    mockPrismaService.product.findUnique.mockResolvedValue(existingProduct);
    mockPrismaService.product.update.mockResolvedValue(updatedProduct);

    const result = await service.update(1, updateProductDto);

    expect(result).toEqual(updatedProduct);

    expect(mockPrismaService.product.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: updateProductDto,
    });
  });

  it('should throw NotFoundException when updating a nonexistent product', async () => {
    mockPrismaService.product.findUnique.mockResolvedValue(null);

    await expect(
      service.update(999, { price: 1000 }),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrismaService.product.update).not.toHaveBeenCalled();
  });

  it('should delete a product', async () => {
    const existingProduct = {
      id: 1,
      name: 'Laptop',
      price: 1200,
    };

    mockPrismaService.product.findUnique.mockResolvedValue(existingProduct);
    mockPrismaService.product.delete.mockResolvedValue(existingProduct);

    await service.remove(1);

    expect(mockPrismaService.product.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('should throw NotFoundException when deleting a nonexistent product', async () => {
    mockPrismaService.product.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);

    expect(mockPrismaService.product.delete).not.toHaveBeenCalled();
  });
});
