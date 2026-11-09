import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

interface JwtPayload {
    sub: number;
}

export interface AuthenticatedRequest extends Request {
    user: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request =
            context.switchToHttp().getRequest<AuthenticatedRequest>();

        const [type, token] =
            request.headers.authorization?.split(' ') ?? [];

        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException(
                'Missing or invalid authorization token',
            );
        }

        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

            if (!Number.isSafeInteger(payload.sub) || payload.sub <= 0) {
                throw new Error('Invalid user ID in JWT');
            }

            request.user = payload;
            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}
