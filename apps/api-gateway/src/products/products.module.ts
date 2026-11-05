import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

@Module({
    imports: [AuthModule],
    controllers: [ProductsController],
    providers: [ProductCatalogClient, JwtAuthGuard, RolesGuard],
})
export class ProductsModule { }