import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProductCatalogClient } from '../clients/product-catalog.client.js';

@Module({
    imports: [
        PrismaModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.getOrThrow<string>('JWT_SECRET'),
            }),
        }),
    ],
    controllers: [CartController],
    providers: [
        CartService,
        JwtAuthGuard,
        ProductCatalogClient,
    ],
})
export class CartModule { }