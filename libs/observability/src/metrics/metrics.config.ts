export function createMetricsConfig(serviceName: string) {
    return {
        path: '/metrics',
        defaultLabels: {
            service: serviceName,
        },
    };
}