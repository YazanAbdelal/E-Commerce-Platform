import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResponse, Product } from '@app/contracts';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FindProductsQueryDto } from './dto/find-products-query.dto.js';
import { ProductsCacheService } from '../cache/products-cache.service.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ProductsCacheService,
  ) { }

  async findAll(query: FindProductsQueryDto): Promise<PaginatedResponse<Product>> {
    const {
      page,
      limit,
      minPrice,
      maxPrice,
      search,
      sortBy,
      order,
    } = query;

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException(
        'minPrice cannot be greater than maxPrice',
      );
    }

    const cached = await this.cache.getList(query);

    if (cached) {
      return cached;
    }

    const where = {
      ...(search
        ? {
          name: {
            contains: search,
            mode: 'insensitive' as const,
          },
        }
        : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
          price: {
            ...(minPrice !== undefined ? { gte: minPrice } : {}),
            ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
          },
        }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: order,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.setList(query, result);

    return result;
  }

  async findOne(id: number) {
    const cached = await this.cache.getProduct(id);

    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    await this.cache.setProduct(product);

    return product;
  }

  async create(createProductDto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: createProductDto,
    });

    await this.cache.invalidate();

    return product;
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    await this.findOne(id); // a nonexistent product produces a NestJS 404 Not Found instead of Prisma's default record-not-found error.

    const product = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });

    await this.cache.invalidate(id);

    return product;
  }

  async remove(id: number) {
    await this.findOne(id); // a nonexistent product produces a NestJS 404 Not Found instead of Prisma's default record-not-found error.

    await this.prisma.product.delete({
      where: { id },
    });

    await this.cache.invalidate(id);
  }

}
