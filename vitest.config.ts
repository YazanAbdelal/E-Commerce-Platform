import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: [
      '**/*.integration.spec.ts',
      '**/*.e2e.spec.ts',
    ],
  },
});