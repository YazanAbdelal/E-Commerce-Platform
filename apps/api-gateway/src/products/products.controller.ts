import { Controller, Get, Param } from '@nestjs/common';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';

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

}
