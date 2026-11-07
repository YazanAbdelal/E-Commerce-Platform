import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: { tsconfigPaths: true },

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
