import { Module } from '@nestjs/common';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [ProductsModule],
  controllers: [ApiGatewayController],
  providers: [ApiGatewayService],
})
export class ApiGatewayModule { }
