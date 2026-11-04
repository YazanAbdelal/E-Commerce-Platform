import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module.js';
import { PrismaModule } from './prisma/prsima.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ProductsModule,
    PrismaModule,
  ],
})
export class ProductCatalogServiceModule { }
