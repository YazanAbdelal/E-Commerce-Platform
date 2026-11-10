#!/usr/bin/env node
/**
 * Database helper: applies Prisma migrations and provisions test databases.
 *
 * Usage:
 *   node scripts/db.mjs migrate               # migrate the development databases
 *   node scripts/db.mjs migrate:test          # migrate the test databases
 *   node scripts/db.mjs create-test-databases # create the test databases if missing
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

/**
 * Each service has a Prisma config that reads a specific URL variable.
 * For tests some services use a dedicated `prisma.test.config.ts`, while
 * others reuse the regular config with the URL variable overridden.
 */
const services = [
  {
    name: 'product-catalog-service',
    dev: { config: 'apps/product-catalog-service/prisma.config.ts', urlVar: 'DATABASE_URL', urlEnv: 'DATABASE_URL' },
    test: { config: 'apps/product-catalog-service/prisma.config.ts', urlVar: 'DATABASE_URL', urlEnv: 'TEST_DATABASE_URL' },
  },
  {
    name: 'user-service',
    dev: { config: 'apps/user-service/prisma.config.ts', urlVar: 'USER_DATABASE_URL', urlEnv: 'USER_DATABASE_URL' },
    test: { config: 'apps/user-service/prisma.test.config.ts', urlVar: 'USER_TEST_DATABASE_URL', urlEnv: 'USER_TEST_DATABASE_URL' },
  },
  {
    name: 'shopping-cart-service',
    dev: { config: 'apps/shopping-cart-service/prisma.config.ts', urlVar: 'CART_DATABASE_URL', urlEnv: 'CART_DATABASE_URL' },
    test: { config: 'apps/shopping-cart-service/prisma.test.config.ts', urlVar: 'CART_TEST_DATABASE_URL', urlEnv: 'CART_TEST_DATABASE_URL' },
  },
  {
    name: 'order-service',
    dev: { config: 'apps/order-service/prisma.config.ts', urlVar: 'ORDER_DATABASE_URL', urlEnv: 'ORDER_DATABASE_URL' },
    test: { config: 'apps/order-service/prisma.config.ts', urlVar: 'ORDER_DATABASE_URL', urlEnv: 'ORDER_TEST_DATABASE_URL' },
  },
  {
    name: 'payment-service',
    dev: { config: 'apps/payment-service/prisma.config.ts', urlVar: 'PAYMENT_DATABASE_URL', urlEnv: 'PAYMENT_DATABASE_URL' },
    test: { config: 'apps/payment-service/prisma.config.ts', urlVar: 'PAYMENT_DATABASE_URL', urlEnv: 'PAYMENT_TEST_DATABASE_URL' },
  },
];

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function migrate(mode) {
  if (!existsSync(prismaCli)) {
    fail('Prisma CLI not found. Run `npm install` first.');
  }

  for (const service of services) {
    const target = service[mode];
    const url = process.env[target.urlEnv];

    if (!url) {
      fail(`${target.urlEnv} is not set. Add it to .env (see README).`);
    }

    console.log(`\n▸ ${service.name} (${target.urlEnv})`);

    const result = spawnSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--config', target.config],
      {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, [target.urlVar]: url },
      },
    );

    if (result.status !== 0) {
      fail(`Migrations failed for ${service.name}.`);
    }
  }

  console.log('\n✔ All migrations applied.\n');
}

async function createTestDatabases() {
  const urls = [
    ...new Set(services.map((service) => process.env[service.test.urlEnv]).filter(Boolean)),
  ];

  if (urls.length === 0) {
    fail('No *_TEST_DATABASE_URL variables are set. Add them to .env (see README).');
  }

  const baseUrl = new URL(process.env.DATABASE_URL ?? urls[0]);
  baseUrl.pathname = '/postgres';
  baseUrl.search = '';

  const client = new pg.Client({ connectionString: baseUrl.toString() });

  try {
    await client.connect();
  } catch (error) {
    fail(`Could not connect to PostgreSQL at ${baseUrl.host}: ${error.message}`);
  }

  try {
    for (const url of urls) {
      const name = new URL(url).pathname.replace(/^\//, '');

      if (!/^[A-Za-z0-9_]+$/.test(name)) {
        fail(`Refusing to create database with unsafe name "${name}".`);
      }

      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);

      if (rowCount > 0) {
        console.log(`  = ${name} (already exists)`);
        continue;
      }

      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`  + ${name} (created)`);
    }
  } finally {
    await client.end();
  }

  console.log('\n✔ Test databases are ready.\n');
}

const command = process.argv[2];

switch (command) {
  case 'migrate':
    migrate('dev');
    break;
  case 'migrate:test':
    migrate('test');
    break;
  case 'create-test-databases':
    await createTestDatabases();
    break;
  default:
    console.error('Usage: node scripts/db.mjs <migrate|migrate:test|create-test-databases>');
    process.exit(1);
}
