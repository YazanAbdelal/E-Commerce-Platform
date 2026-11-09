import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
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