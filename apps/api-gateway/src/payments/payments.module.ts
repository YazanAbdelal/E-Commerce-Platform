import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller.js';
import { PaymentClient } from '../clients/payment.client.js';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Module({
    imports: [AuthModule],
    controllers: [PaymentsController],
    providers: [PaymentClient, JwtAuthGuard],
    exports: [PaymentClient],
})
export class PaymentsModule { }
