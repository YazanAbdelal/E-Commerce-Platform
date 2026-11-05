import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UserClientModule } from '../clients/user-client.module.js';

@Module({
    imports: [UserClientModule],
    controllers: [UsersController],
})
export class UsersModule { }