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
    include: ['**/*.e2e.spec.ts'],
    // E2E suites boot the real services against the shared test databases and
    // clear those tables in beforeEach. Running files in parallel lets one
    // suite delete rows another suite is using, so keep them sequential.
    fileParallelism: false,
  },
  oxc: {
    decorator: {
      legacy: true,
      emitDecoratorMetadata: true,
    },
  },
});
