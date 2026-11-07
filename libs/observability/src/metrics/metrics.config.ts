export function createMetricsConfig(serviceName: string) {
    return {
        path: '/metrics',
        defaultLabels: {
            service: serviceName,
        },
        defaultMetrics: {
            enabled: process.env.NODE_ENV !== 'test',
        },
    };
}