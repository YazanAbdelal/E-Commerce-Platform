import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'apps/product-catalog-service/prisma/schema.prisma',
  migrations: {
    path: 'apps/product-catalog-service/prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});