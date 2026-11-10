import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
    '@app/contracts': fileURLToPath(
        new URL('./libs/contracts/src/index.ts', import.meta.url),
    ),
    '@app/observability': fileURLToPath(
        new URL('./libs/observability/src/index.ts', import.meta.url),
    ),
};

export default defineConfig({
    resolve: { tsconfigPaths: true, alias },

    oxc: {
        decorator: {
            legacy: true,
            emitDecoratorMetadata: true,
        },
    },

    test: {
        globals: true,
        root: './',
        include: ['**/*.integration.spec.ts'],
    },
});
