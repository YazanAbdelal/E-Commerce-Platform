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
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: [
      '**/*.e2e.spec.ts',
      '**/*.integration.spec.ts',
    ],
  },
  oxc: {
    decorator: {
      legacy: true,
      emitDecoratorMetadata: true,
    },
  },
});
