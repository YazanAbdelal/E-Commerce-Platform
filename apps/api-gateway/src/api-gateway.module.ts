import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { ProductsModule } from './products/products.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthController } from './auth/auth.controller.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { UsersModule } from './users/users.module.js';
import { UserClientModule } from './clients/user-client.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    ProductsModule,
    UsersModule,
    UserClientModule,
  ],
  controllers: [ApiGatewayController, AuthController],
  providers: [ApiGatewayService, JwtAuthGuard, RolesGuard],
})
export class ApiGatewayModule { }