import { Module } from '@nestjs/common';
import { UserClient } from './user.client.js';

@Module({
    providers: [UserClient],
    exports: [UserClient],
})
export class UserClientModule { }