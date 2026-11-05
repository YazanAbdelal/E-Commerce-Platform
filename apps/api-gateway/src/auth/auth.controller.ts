import {
    Controller,
    Get,
    Request,
    UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() request: any) {
        return request.user;
    }
}