import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from '@app/observability';


@Module({
  imports: [
    LoggerModule.forRoot(createLoggerConfig('user-service')),
    ConfigModule.forRoot({ isGlobal: true }), // for loading the .env file into process.env
    PrismaModule,
    UsersModule,
    AuthModule,
  ],
})
export class UserServiceModule { }
