import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;

  const mockProductsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    controller = new ProductsController(
      mockProductsService as unknown as ProductsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate findAll to ProductsService', async () => {
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'name' as const,
      order: 'asc' as const,
    };
    const response = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };

    mockProductsService.findAll.mockResolvedValue(response);

    await expect(controller.findAll(query)).resolves.toEqual(response);
    expect(mockProductsService.findAll).toHaveBeenCalledWith(query);
  });

  it('should delegate findOne to ProductsService', async () => {
    const product = { id: 1, name: 'Laptop', price: 1200 };
    mockProductsService.findOne.mockResolvedValue(product);

    await expect(controller.findOne(1)).resolves.toEqual(product);
    expect(mockProductsService.findOne).toHaveBeenCalledWith(1);
  });

  it('should delegate create to ProductsService', async () => {
    const dto = { name: 'Keyboard', price: 80 };
    const product = { id: 2, ...dto };

    mockProductsService.create.mockResolvedValue(product);

    await expect(controller.create(dto)).resolves.toEqual(product);
    expect(mockProductsService.create).toHaveBeenCalledWith(dto);
  });

  it('should delegate update to ProductsService', async () => {
    const dto = { price: 1000 };
    const product = { id: 1, name: 'Laptop', price: 1000 };

    mockProductsService.update.mockResolvedValue(product);

    await expect(controller.update(1, dto)).resolves.toEqual(product);
    expect(mockProductsService.update).toHaveBeenCalledWith(1, dto);
  });

  it('should delete a product and return the success message', async () => {
    mockProductsService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(1)).resolves.toEqual({
      message: 'Product deleted successfuly.',
    });

    expect(mockProductsService.remove).toHaveBeenCalledWith(1);
  });

  it('should propagate service errors when deleting a product', async () => {
    mockProductsService.remove.mockRejectedValue(new Error('Database error'));

    await expect(controller.remove(1)).rejects.toThrow('Database error');
  });
});