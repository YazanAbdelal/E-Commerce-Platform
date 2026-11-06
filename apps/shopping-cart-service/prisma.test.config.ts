import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
    schema: './prisma/schema.prisma',
    migrations: {
        path: './prisma/migrations',
    },
    datasource: {
        url: env('CART_TEST_DATABASE_URL'),
    },
});