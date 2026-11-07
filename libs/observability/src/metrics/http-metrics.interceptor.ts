import {
    Injectable,
    type CallHandler,
    type ExecutionContext,
    type NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Histogram } from '@prometheus-io/client';
import type { Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import { Observable } from 'rxjs';
import {
    HTTP_REQUEST_DURATION,
    HTTP_REQUESTS_TOTAL,
} from './http-metrics.providers.js';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
    constructor(
        @InjectMetric(HTTP_REQUESTS_TOTAL)
        private readonly requestCounter: Counter<string>,

        @InjectMetric(HTTP_REQUEST_DURATION)
        private readonly requestDuration: Histogram<string>,
    ) { }

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse<Response>();

        // Don't count Prometheus scraping as application traffic.
        if (request.path === '/metrics') {
            return next.handle();
        }

        const startTime = performance.now();

        // Use the route template, not the actual URL containing resource IDs.
        const route = request.route?.path;
        const routeLabel =
            typeof route === 'string'
                ? `${request.baseUrl}${route}` || '/'
                : 'unmatched';

        response.once('finish', () => {
            const durationSeconds = (performance.now() - startTime) / 1000;

            const labels = {
                method: request.method,
                route: routeLabel,
                status_code: String(response.statusCode),
            };

            this.requestCounter.inc(labels);
            this.requestDuration.observe(labels, durationSeconds);
        });

        return next.handle();
    }
}