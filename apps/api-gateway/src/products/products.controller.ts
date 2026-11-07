import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';
import { UserRole, type CreateProductRequest, type UpdateProductRequest } from '@app/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { Request } from 'express';

type RequestWithId = Request & { id: string };

@Controller('products')
export class ProductsController {
  constructor(private readonly productCatalogClient: ProductCatalogClient) { }

  @Get()
  findAll(
    @Query() query: Record<string, string | undefined>,
    @Req() req: RequestWithId,
  ) {
    return this.productCatalogClient.findAll(query, req.id);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: RequestWithId,
  ) {
    return this.productCatalogClient.findOne(Number(id), req.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(
    @Body() data: CreateProductRequest,
    @Req() req: RequestWithId,
  ) {
    return this.productCatalogClient.create(data, req.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdateProductRequest,
    @Req() req: RequestWithId,
  ) {
    return this.productCatalogClient.update(id, data, req.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Req() req: RequestWithId,
  ) {
    return this.productCatalogClient.remove(id, req.id);
  }
}

