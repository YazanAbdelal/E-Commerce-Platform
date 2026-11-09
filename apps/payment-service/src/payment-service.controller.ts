import {
  Body,
  Controller,
  Get,
  Headers,
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
import { CreatePaymentDto } from './dto/create-payment.dto.js';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentServiceController {
  constructor(
    private readonly paymentServiceService: PaymentServiceService,
  ) { }

  @Post()
  createPayment(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentServiceService.createPayment(
      request.user.sub,
      body.orderId,
      request.headers.authorization!,
      idempotencyKey,
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
      request.headers.authorization!,
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
      request.headers.authorization!,
    );
  }
}
