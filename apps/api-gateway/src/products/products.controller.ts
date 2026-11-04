import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';
import type { CreateProductRequest } from '@app/contracts';

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

  @Post()
  create(@Body() data: CreateProductRequest) {
    return this.productCatalogClient.create(data);
  }
}
