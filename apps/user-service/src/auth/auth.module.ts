import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';


@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({ // Instead of configuring JWT immediately, NestJS waits until it can retrieve the configuration from ConfigService.
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'), // Retrieves the secret from .env. getOrThrow() also makes the application fail during initialization if the secret is missing.
        signOptions: {
          expiresIn: '15m',
        },
      }),
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard]
})
export class AuthModule { }
