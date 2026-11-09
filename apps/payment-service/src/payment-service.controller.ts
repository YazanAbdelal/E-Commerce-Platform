import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PaymentServiceService } from './payment-service.service.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from './auth/guards/jwt-auth.guard.js';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentServiceController {
  constructor(
    private readonly paymentServiceService: PaymentServiceService,
  ) { }

  @Post()
  createPayment(
    @Req() request: AuthenticatedRequest,
    @Body() body: { orderId: number; amount: number },
  ) {
    return this.paymentServiceService.createPayment(
      request.user.sub,
      body.orderId,
      body.amount,
      request.headers.authorization!,
    );
  }

  @Get()
  getPayments(@Req() request: AuthenticatedRequest) {
    return this.paymentServiceService.getPayments(request.user.sub);
  }

  @Get(':id')
  getPayment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) paymentId: number,
  ) {
    return this.paymentServiceService.getPayment(request.user.sub, paymentId);
  }

  @Post(':id/capture')
  @HttpCode(HttpStatus.OK)
  capturePayment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) paymentId: number,
  ) {
    return this.paymentServiceService.capturePayment(
      request.user.sub,
      paymentId,
    );
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  refundPayment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) paymentId: number,
  ) {
    return this.paymentServiceService.refundPayment(
      request.user.sub,
      paymentId,
    );
  }
}