import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import { OrderServiceService } from './order-service.service.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from './auth/guards/jwt-auth.guard.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderServiceController {
  constructor(
    private readonly orderServiceService: OrderServiceService,
  ) { }

  @Post()
  createOrder(@Req() request: AuthenticatedRequest) {
    const [, token] = request.headers.authorization!.split(' ');

    return this.orderServiceService.createOrder(
      request.user.sub,
      token,
    );
  }

  @Get()
  getOrders(@Req() request: AuthenticatedRequest) {
    return this.orderServiceService.getOrders(request.user.sub);
  }

  @Get(':id')
  getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) orderId: number,
  ) {
    return this.orderServiceService.getOrder(
      request.user.sub,
      orderId,
    );
  }
}