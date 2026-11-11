import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsCacheService } from '../cache/products-cache.service.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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

  const mockCacheService = {
    getList: vi.fn(),
    setList: vi.fn(),
    getProduct: vi.fn(),
    setProduct: vi.fn(),
    invalidate: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockCacheService.getList.mockResolvedValue(null);
    mockCacheService.getProduct.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ProductsCacheService,
          useValue: mockCacheService,
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

    expect(mockCacheService.invalidate).toHaveBeenCalledWith();
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

    expect(mockCacheService.invalidate).toHaveBeenCalledWith(1);
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

    expect(mockCacheService.invalidate).toHaveBeenCalledWith(1);
  });

  it('should throw NotFoundException when deleting a nonexistent product', async () => {
    mockPrismaService.product.findUnique.mockResolvedValue(null);

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);

    expect(mockPrismaService.product.delete).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when minPrice is greater than maxPrice', async () => {
    const query = {
      page: 1,
      limit: 10,
      minPrice: 100,
      maxPrice: 50,
      sortBy: 'name' as const,
      order: 'asc' as const,
    };

    await expect(service.findAll(query))
      .rejects.toThrow(BadRequestException);

    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });

  it('should apply search and price filters with pagination and sorting', async () => {
    const products = [
      { id: 1, name: 'Gaming Laptop', price: 1200 },
    ];

    const query = {
      page: 2,
      limit: 5,
      search: 'laptop',
      minPrice: 500,
      maxPrice: 1500,
      sortBy: 'price' as const,
      order: 'desc' as const,
    };

    mockPrismaService.product.findMany.mockResolvedValue(products);
    mockPrismaService.product.count.mockResolvedValue(12);
    mockPrismaService.$transaction.mockResolvedValue([products, 12]);

    const result = await service.findAll(query);

    const expectedWhere = {
      name: {
        contains: 'laptop',
        mode: 'insensitive',
      },
      price: {
        gte: 500,
        lte: 1500,
      },
    };

    expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      skip: 5,
      take: 5,
      orderBy: {
        price: 'desc',
      },
    });

    expect(mockPrismaService.product.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });

    expect(result.meta).toEqual({
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3,
    });
  });

  it('should apply only the minimum price filter', async () => {
    mockPrismaService.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({
      page: 1,
      limit: 10,
      minPrice: 100,
      sortBy: 'name',
      order: 'asc',
    });

    expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
      where: {
        price: {
          gte: 100,
        },
      },
      skip: 0,
      take: 10,
      orderBy: {
        name: 'asc',
      },
    });
  });

  it('should apply only the maximum price filter', async () => {
    mockPrismaService.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({
      page: 1,
      limit: 10,
      maxPrice: 500,
      sortBy: 'name',
      order: 'asc',
    });

    expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
      where: {
        price: {
          lte: 500,
        },
      },
      skip: 0,
      take: 10,
      orderBy: {
        name: 'asc',
      },
    });
  });

  describe('cache', () => {
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'name' as const,
      order: 'asc' as const,
    };

    it('should serve a cached product list without touching the database', async () => {
      const cached = {
        data: [{ id: 1, name: 'Cached Laptop', price: 999 }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      mockCacheService.getList.mockResolvedValue(cached);

      await expect(service.findAll(query)).resolves.toEqual(cached);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should cache the list it reads from the database', async () => {
      const products = [{ id: 1, name: 'Laptop', price: 1200 }];
      mockPrismaService.$transaction.mockResolvedValue([products, 1]);

      const result = await service.findAll(query);

      expect(mockCacheService.setList).toHaveBeenCalledWith(query, result);
    });

    it('should serve a cached product without touching the database', async () => {
      const cached = { id: 1, name: 'Cached Laptop', price: 999 };
      mockCacheService.getProduct.mockResolvedValue(cached);

      await expect(service.findOne(1)).resolves.toEqual(cached);
      expect(mockPrismaService.product.findUnique).not.toHaveBeenCalled();
    });

    it('should cache the product it reads from the database', async () => {
      const product = { id: 1, name: 'Laptop', price: 1200 };
      mockPrismaService.product.findUnique.mockResolvedValue(product);

      await service.findOne(1);

      expect(mockCacheService.setProduct).toHaveBeenCalledWith(product);
    });

    it('should not cache a product that does not exist', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockCacheService.setProduct).not.toHaveBeenCalled();
    });

    it('should validate the price range before consulting the cache', async () => {
      await expect(
        service.findAll({ ...query, minPrice: 100, maxPrice: 50 }),
      ).rejects.toThrow(BadRequestException);

      expect(mockCacheService.getList).not.toHaveBeenCalled();
    });
  });
});
