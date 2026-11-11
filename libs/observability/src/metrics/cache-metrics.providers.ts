import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

export const CACHE_HITS_TOTAL = 'cache_hits_total';
export const CACHE_MISSES_TOTAL = 'cache_misses_total';
export const CACHE_ERRORS_TOTAL = 'cache_errors_total';

const labelNames = ['cache'];

/**
 * Hit/miss counters make the cache observable: a hit ratio that collapses is
 * the first sign that Redis is unreachable or invalidating too aggressively.
 */
export function createCacheMetricsProviders() {
    return [
        makeCounterProvider({
            name: CACHE_HITS_TOTAL,
            help: 'Cache lookups served without hitting the origin.',
            labelNames,
        }),

        makeCounterProvider({
            name: CACHE_MISSES_TOTAL,
            help: 'Cache lookups that fell through to the origin.',
            labelNames,
        }),

        makeCounterProvider({
            name: CACHE_ERRORS_TOTAL,
            help: 'Cache operations that failed and degraded to the origin.',
            labelNames,
        }),
    ];
}
