import {
    makeCounterProvider,
    makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

export const HTTP_REQUESTS_TOTAL = 'http_requests_total';
export const HTTP_REQUEST_DURATION = 'http_request_duration_seconds';

const labelNames = ['method', 'route', 'status_code'];

export function createHttpMetricsProviders() {
    return [
        makeCounterProvider({
            name: HTTP_REQUESTS_TOTAL,
            help: 'Total number of HTTP requests.',
            labelNames,
        }),

        makeHistogramProvider({
            name: HTTP_REQUEST_DURATION,
            help: 'Duration of HTTP requests in seconds.',
            labelNames,
            buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        }),
    ];
}