import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResponse, Product } from '@app/contracts';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FindProductsQueryDto } from './dto/find-products-query.dto.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) { }

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

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    return product;
  }

  async create(createProductDto: CreateProductDto) {
    return this.prisma.product.create({
      data: createProductDto,
    });
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    await this.findOne(id); // a nonexistent product produces a NestJS 404 Not Found instead of Prisma's default record-not-found error.

    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id); // a nonexistent product produces a NestJS 404 Not Found instead of Prisma's default record-not-found error.

    await this.prisma.product.delete({
      where: { id },
    });
  }

}
