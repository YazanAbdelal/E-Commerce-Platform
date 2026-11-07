import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function createLoggerConfig(serviceName: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        pinoHttp: {
            level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

            genReqId(req: IncomingMessage, res: ServerResponse) {
                const incomingId = req.headers['x-request-id'];

                const isValid =
                    typeof incomingId === 'string' &&
                    /^[A-Za-z0-9._:-]{1,128}$/.test(incomingId);

                const requestId = isValid ? incomingId : randomUUID();

                res.setHeader('x-request-id', requestId);

                return requestId;
            },

            customProps(req: IncomingMessage & { id?: string }) {
                return {
                    service: serviceName,
                    requestId: req.id,
                };
            },

            redact: {
                paths: [
                    'req.headers.authorization',
                    'req.headers.cookie',
                    'res.headers.set-cookie',
                    'req.body.password',
                    'req.body.passwordConfirmation',
                    'req.body.currentPassword',
                    'req.body.newPassword',
                    'req.body.accessToken',
                    'req.body.refreshToken',
                ],
                censor: '[REDACTED]',
            },

            ...(!isProduction && {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        singleLine: true,
                        translateTime: 'SYS:standard',
                    },
                },
            }),
        },
    };
}