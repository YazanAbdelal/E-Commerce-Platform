import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        const [type, token] =
            request.headers.authorization?.split(' ') ?? [];

        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException(
                'Missing or invalid authorization token',
            );
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                algorithms: ['HS256'],
            });

            request.user = payload;
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }

        return true;
    }
}