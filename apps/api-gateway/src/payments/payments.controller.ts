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

import type { Request } from 'express';

import { PaymentClient } from '../clients/payment.client.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

type RequestWithId = Request & {
    id: string;
};

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
    constructor(private readonly paymentClient: PaymentClient) { }

    @Post()
    createPayment(
        @Req() request: RequestWithId,
        @Body() body: CreatePaymentDto,
        @Headers('idempotency-key') idempotencyKey?: string,
    ) {
        return this.paymentClient.createPayment(
            request.headers.authorization!,
            request.id,
            body.orderId,
            idempotencyKey,
        );
    }

    @Get()
    getPayments(@Req() request: RequestWithId) {
        return this.paymentClient.getPayments(
            request.headers.authorization!,
            request.id,
        );
    }

    @Get(':id')
    getPayment(
        @Req() request: RequestWithId,
        @Param('id', ParseIntPipe) paymentId: number,
    ) {
        return this.paymentClient.getPayment(
            request.headers.authorization!,
            request.id,
            paymentId,
        );
    }

    @Post(':id/capture')
    @HttpCode(HttpStatus.OK)
    capturePayment(
        @Req() request: RequestWithId,
        @Param('id', ParseIntPipe) paymentId: number,
    ) {
        return this.paymentClient.capturePayment(
            request.headers.authorization!,
            request.id,
            paymentId,
        );
    }

    @Post(':id/refund')
    @HttpCode(HttpStatus.OK)
    refundPayment(
        @Req() request: RequestWithId,
        @Param('id', ParseIntPipe) paymentId: number,
    ) {
        return this.paymentClient.refundPayment(
            request.headers.authorization!,
            request.id,
            paymentId,
        );
    }
}
