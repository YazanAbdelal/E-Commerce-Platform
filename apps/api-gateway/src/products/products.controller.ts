import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';
import { UserRole, type CreateProductRequest, type UpdateProductRequest } from '@app/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productCatalogClient: ProductCatalogClient) { }

  @Get()
  findAll() {
    return this.productCatalogClient.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productCatalogClient.findOne(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() data: CreateProductRequest) {
    return this.productCatalogClient.create(data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: UpdateProductRequest) {
    return this.productCatalogClient.update(id, data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productCatalogClient.remove(id);
  }
}

