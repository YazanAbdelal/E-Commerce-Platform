# E-Commerce Platform

An e-commerce backend built with NestJS as a Nest CLI monorepo: a single API
gateway in front of five independently deployable services, each with its own
PostgreSQL database and Prisma schema, plus shared libraries for API contracts
and observability.

## Architecture

```text
client -> nginx (Docker only) -> api-gateway :3000
                                     |
     +---------------+---------------+--------------+---------------+
     |               |               |              |               |
product-catalog   user-service   shopping-cart   order          payment
    :3001            :3002          :3003         :3004           :3005
      |
   Redis (read cache)
```

| Service | Port | Database | Responsibility |
|---|---|---|---|
| `api-gateway` | 3000 | – | Single public API surface: auth, validation, routing to services |
| `product-catalog-service` | 3001 | `product_catalog` | Products, search, filtering, inventory; Redis-backed read cache |
| `user-service` | 3002 | `user_service` | Registration, login, JWT issuing, users, roles |
| `shopping-cart-service` | 3003 | `shopping_cart` | Cart and cart items, product availability checks |
| `order-service` | 3004 | `order_service` | Order creation from carts, order lifecycle |
| `payment-service` | 3005 | `payment_service` | Payments for orders, capture and refund |

Services talk to each other over HTTP through small typed clients (for example
`shopping-cart-service` calls `product-catalog-service` to validate stock, and
`payment-service` calls `order-service` to verify order ownership). Callers
propagate a request ID (`x-request-id`) for tracing across services.

## Tech Stack

- **NestJS 12** on **Node.js 24**, TypeScript 6, ESM
- **Prisma 7** with the `pg` driver adapter, one schema per service
- **PostgreSQL 17**
- **Redis 7** as a write-invalidated read cache in the product catalog
- **Rspack** (via Nest CLI) for builds
- **JWT** (`@nestjs/jwt`) + **bcrypt** for auth, `class-validator` for DTO validation
- **Pino** structured logging (`nestjs-pino`)
- **Prometheus** metrics per service (`@willsoto/nestjs-prometheus`)
- **OpenTelemetry** traces exported over OTLP to **Tempo**
- **Grafana**, **Loki** and **Alloy** for dashboards and log aggregation
- **Vitest** for unit, integration and E2E tests
- **Docker / Docker Compose**, GitHub Actions CI

## Prerequisites

- Node.js 24 (the Dockerfile and CI both use Node 24)
- npm (the repo uses `package-lock.json`; use `npm ci` for clean installs)
- Docker and Docker Compose, for the containerized stack
- PostgreSQL 17, if you run services directly on the host
- Redis 7, if you run the product catalog directly on the host

## Quick Start

### With Docker

```bash
# 1. Create a root .env with the variables listed below
#    (at minimum JWT_SECRET, the five *_DATABASE_URL values, and the
#    *_TEST_DATABASE_URL values if you plan to run the integration/E2E suites;
#    REDIS_URL defaults to localhost and is wired to the cache container)

# 2. Build and start the stack
cd infrastructure
docker compose --env-file ../.env up -d --build
```

The compose file lives in `infrastructure/`, so `--env-file ../.env` points it at
the root `.env` (compose only reads `.env` from its own directory by default).

Every service applies its own Prisma migrations on startup via
`docker-entrypoint.sh` before the app boots, so the schema is always current
when a container comes up. `api-gateway` has no database and skips this step.
Set `RUN_MIGRATIONS=false` on a service to skip migrations (for example in a
one-off shell).

On a fresh volume, `infrastructure/postgres/init/` creates both the service
databases and the `*_test` databases. If your Postgres volume already exists,
those init scripts won't re-run — create and migrate the test databases from
the host instead:

```bash
npm run db:test:create
npm run db:migrate:test
```

Once running:

| URL | What |
|---|---|
| http://localhost | API, via nginx → `api-gateway` |
| http://localhost:3000 | Grafana |
| http://localhost:9090 | Prometheus |
| localhost:5432 | PostgreSQL (`ecommerce` / `ecommerce_dev`) |

Rebuild images after code changes:

```bash
cd infrastructure && docker compose --env-file ../.env up -d --build
```

nginx re-resolves the gateway on every request, so recreated containers do not
leave it proxying to a stale address.

### Without Docker

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` in the repo root with the variables from
   [Environment Variables](#environment-variables).

3. Create the databases (either use the init scripts or `createdb`):

```bash
psql -U ecommerce -d postgres -f infrastructure/postgres/init/01-create-databases.sql
psql -U ecommerce -d postgres -f infrastructure/postgres/init/02-create-test-databases.sql
```

4. Apply Prisma migrations:

```bash
npm run db:migrate
```

5. Start the services. Either start everything yourself in separate terminals:

```bash
npx nest start api-gateway --watch
npx nest start product-catalog-service --watch
npx nest start user-service --watch
npx nest start shopping-cart-service --watch
npx nest start order-service --watch
npx nest start payment-service --watch
```

or start only the gateway with `npm run start:dev` (which builds the root
project, `api-gateway`).

The API is then available at http://localhost:3000. Clients default to the
localhost ports above, so no service-URL variables are required locally.

`requests.http` contains ready-to-run example requests for the gateway and the
individual services.

## Available Scripts

| Script | Description |
|---|---|
| `npm run build` | Build the project (Nest CLI monorepo build) |
| `npm run start` | Start the default project (`api-gateway`) |
| `npm run start:dev` | Same, in watch mode |
| `npm run start:debug` | Same, with the Node inspector |
| `npm run format` | Format `apps/` and `libs/` with Prettier |
| `npm run lint` | Lint with oxlint (type-aware) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Coverage across unit, integration and E2E, merged into one project-wide figure |
| `npm run test:cov:unit` | Coverage for the unit suite only |
| `npm run test:integration` | Integration tests (`*.integration.spec.ts`) |
| `npm run test:e2e` | E2E tests (`*.e2e.spec.ts`) |
| `npm run test:load` | k6 load test through nginx (needs the stack running) |
| `npm run db:migrate` | Apply Prisma migrations to the development databases |
| `npm run db:migrate:test` | Apply Prisma migrations to the test databases |
| `npm run db:test:create` | Create any missing `*_TEST_DATABASE_URL` databases |

Build or serve a specific app:

```bash
npx nest build <app>
npx nest start <app> --watch
```

Valid app names: `api-gateway`, `product-catalog-service`, `user-service`,
`shopping-cart-service`, `order-service`, `payment-service` (plus the
`contracts` and `observability` libraries).

## Environment Variables

All variables live in a single root `.env`. Each service reads only what it
needs.

| Variable | Used by | Description |
|---|---|---|
| `JWT_SECRET` | gateway, user, cart, order, payment | Secret for signing/verifying JWTs (required) |
| `DATABASE_URL` | product-catalog | Product catalog database URL |
| `USER_DATABASE_URL` | user-service | User database URL |
| `CART_DATABASE_URL` | shopping-cart | Cart database URL |
| `ORDER_DATABASE_URL` | order-service | Order database URL |
| `PAYMENT_DATABASE_URL` | payment-service | Payment database URL |
| `REDIS_URL` | product-catalog | Cache URL, defaults to `redis://localhost:6379` |
| `PRODUCT_CACHE_TTL_SECONDS` / `PRODUCT_LIST_CACHE_TTL_SECONDS` | product-catalog | Cache TTLs, default 60s for a product and 30s for a list |
| `*_TEST_DATABASE_URL` | tests | Test databases used by `db:test:create`, `db:migrate:test`, and CI |
| `REDIS_TEST_URL` | tests | Redis database index used by integration/E2E (default index 15) |
| `PORT` | all | Overrides the default port |
| `PRODUCT_CATALOG_URL` | gateway, cart, order | Defaults to `http://localhost:3001` |
| `USER_SERVICE_URL` | gateway | Defaults to `http://localhost:3002` |
| `CART_SERVICE_URL` / `SHOPPING_CART_URL` | gateway / order-service | Defaults to `http://localhost:3003` |
| `ORDER_SERVICE_URL` | gateway, payment | Defaults to `http://localhost:3004` |
| `PAYMENT_SERVICE_URL` | gateway | Defaults to `http://localhost:3005` |

Example:

```bash
DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/product_catalog?schema=public"
USER_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/user_service?schema=public"
CART_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/shopping_cart?schema=public"
ORDER_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/order_service?schema=public"
PAYMENT_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/payment_service?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="<a-long-random-string>"

# Only needed for `npm run db:test:create`, `db:migrate:test` and the test suites
TEST_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/product_catalog_test?schema=public"
USER_TEST_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/user_service_test?schema=public"
CART_TEST_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/shopping_cart_test?schema=public"
ORDER_TEST_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/order_service_test?schema=public"
PAYMENT_TEST_DATABASE_URL="postgresql://ecommerce:ecommerce_dev@localhost:5432/payment_service_test?schema=public"
REDIS_TEST_URL="redis://localhost:6379/15"
```

## Project Structure

```text
e-commerce/
├── apps/
│   ├── api-gateway/              # Public entry point, auth, routing
│   ├── user-service/             # Users, auth, JWT issuing
│   ├── product-catalog-service/  # Products and inventory
│   ├── shopping-cart-service/    # Carts and cart items
│   ├── order-service/            # Orders and order status
│   └── payment-service/          # Payments, capture, refunds
├── libs/
│   ├── contracts/                # Shared request/response types and roles
│   └── observability/            # Pino logging + Prometheus metrics setup
├── infrastructure/
│   ├── docker-compose.yml        # Full stack: services, Postgres, observability
│   ├── nginx/                    # Reverse proxy in front of the gateway
│   ├── postgres/init/            # Creates the service and test databases
│   ├── prometheus/               # Scrape config for all six services
│   └── loki/, alloy/, tempo/     # Log and trace pipelines
├── scripts/db.mjs                # db:migrate / db:migrate:test / db:test:create
├── docker-entrypoint.sh          # Runs `prisma migrate deploy` before app start
├── .github/workflows/ci.yml      # Build, migrate, and test pipeline
├── requests.http                 # Example API requests
└── nest-cli.json                 # Monorepo project definitions
```

Each app keeps its own `prisma/schema.prisma`, `prisma/migrations/` and
`prisma.config.ts`.

## API Overview

All routes below are exposed by the gateway on port 3000 (port 80 through
nginx). Protected routes expect `Authorization: Bearer <jwt>` from
`POST /auth/login`; product write routes additionally require the `ADMIN` role.

### Auth and users

| Method | Route | Description |
|---|---|---|
| `POST` | `/auth/login` | Log in with email and password, returns a JWT |
| `GET` | `/auth/profile` | Current user from the JWT |
| `POST` | `/users` | Register a new user |
| `GET` | `/users/:id` | Get a user (owner or admin) |
| `PATCH` | `/users/me` | Update the authenticated user |

### Products

| Method | Route | Description |
|---|---|---|
| `GET` | `/products` | List/search products with filters and pagination |
| `GET` | `/products/:id` | Get a product by ID |
| `POST` | `/products` | Create a product (admin) |
| `PATCH` | `/products/:id` | Update a product (admin) |
| `DELETE` | `/products/:id` | Delete a product (admin) |

### Cart

| Method | Route | Description |
|---|---|---|
| `GET` | `/cart` | Get the authenticated user's cart |
| `POST` | `/cart/items` | Add an item |
| `PATCH` | `/cart/items/:productId` | Update item quantity |
| `DELETE` | `/cart/items/:productId` | Remove an item |
| `DELETE` | `/cart` | Clear the cart |

### Orders

| Method | Route | Description |
|---|---|---|
| `POST` | `/orders` | Create an order from the current cart |
| `GET` | `/orders` | List the user's orders |
| `GET` | `/orders/:id` | Get an order by ID |

Order status moves through `PENDING → CONFIRMED → PROCESSING → SHIPPED →
DELIVERED`, with `CANCELLED` as a terminal state. `order-service` also exposes
`PATCH /orders/:id/status` internally for those transitions.

### Payments

| Method | Route | Description |
|---|---|---|
| `POST` | `/payments` | Create a payment for an order |
| `GET` | `/payments` | List the user's payments |
| `GET` | `/payments/:id` | Get a payment |
| `POST` | `/payments/:id/capture` | Capture a pending payment |
| `POST` | `/payments/:id/refund` | Refund a completed payment |

Payment status moves through `PENDING → COMPLETED → REFUNDED`, with `FAILED`
for declined payments. Payment creation verifies that the order belongs to the
requesting user before anything is charged.

## Caching

The product catalog is the only read-heavy service, so it is the only one with
a cache. `GET /products` and `GET /products/:id` are cache-aside: a miss reads
Postgres and populates Redis.

- A product is stored under `catalog:product:{id}` for 60 seconds.
- A list is stored for 30 seconds under a key that embeds a version counter,
  `catalog:products:{version}:{query fingerprint}`.
- Any write deletes the affected detail key and increments the version, which
  retires every cached list at once without scanning for keys. TTLs are only a
  safety net for entries nobody invalidates.
- Redis is optional at runtime: the client fails fast instead of queueing
  commands, and every cache error is logged and counted while the request falls
  through to Postgres. A cache outage costs latency, not availability.

## Testing

```bash
npm test                 # unit tests
npm run test:cov         # unit + integration + E2E coverage, merged
npm run test:cov:unit    # unit tests with coverage only
npm run test:integration # integration tests (need the test databases)
npm run test:e2e         # E2E tests (boots real services against test DBs)
```

`npm run test:cov` runs all three suites and merges their reports, so files no
suite touches count as uncovered; it therefore needs the test databases too.
Coverage is scoped to `apps/**/src` and `libs/**/src`, excluding generated
Prisma clients and spec files. Pass suite names to run a subset:
`node scripts/coverage.mjs unit e2e`.

Integration and E2E suites expect the test databases from `.env` to exist and
to be migrated, plus a Redis instance the catalog cache can use
(`REDIS_TEST_URL`, database index 15). With the compose stack running, Redis is
already reachable on `localhost:6379`. Prepare the databases once:

```bash
npm run db:test:create   # create the *_test databases that don't exist yet
npm run db:migrate:test  # apply each service's migrations to its test database
```

E2E files run sequentially because they share and truncate those databases.
`npm run test:e2e` also needs `JWT_SECRET` set.

### Load testing

```bash
npm run test:load            # mixed workload, 50 concurrent users, ~90s
npm run test:load -- --smoke # a few seconds, validates the script
```

k6 runs in a container attached to the compose network, so every request goes
through nginx, the gateway and the downstream service exactly as real traffic
does. The scenario mixes 40 VUs browsing the catalog (list + detail) with 10
VUs running the full checkout (register → login → cart → order → payment →
capture), ramps to 50 concurrent users and holds for a minute. The run fails if
more than 1% of requests error, or if p95 exceeds 1s for browsing or 3s for
checkout.

`--vus` and `--duration` override the scenarios and run a catalog-only stress
test, which is the quickest way to find the read path's ceiling:

```bash
npm run test:load -- --vus 50 --duration 60s -e THINK_TIME=0
```

`THINK_TIME` sets the maximum pause between requests inside a virtual user, so
`0` turns the run into a closed-loop saturation test instead of a simulated
session.

Measured on a dev laptop (Docker Desktop, six services, Postgres and Redis),
same script, same 60s run, with the cache switched off by stopping the Redis
container:

| Catalog-only, 50 VUs | Throughput | p95 | Errors |
|---|---|---|---|
| Cache off | 255.8 req/s | 255 ms | 0% |
| Cache on | 311.7 req/s | 201 ms | 0% |

That is +22% throughput and 21% lower p95 on the read path, with a 99.75% hit
ratio (18,704 hits, 46 misses). Stopping Redis mid-run costs throughput but not
availability: every request still succeeded. The gain is bounded by how cheap
the underlying query already is — three-column rows in a small table — so the
cache removes a round trip rather than a slow scan.

The mixed workload (40 browsing + 10 checkout VUs, one-second think time) is
dominated by the checkout chain, which writes and therefore never reads the
cache: 155.6 req/s with the cache and 151.1 req/s without, both at 0% errors,
with average latency dropping from 39ms to 31ms.

These are laptop numbers from a closed-loop test, not a saturation benchmark of
the stack; use them for relative comparison, not as a capacity claim.

The checkout workload writes users, carts, orders and payments, so point it at
the compose stack rather than at data you care about.

## Observability

- Every service exposes Prometheus metrics at `/metrics`; Prometheus scrapes
  all six in `infrastructure/prometheus/prometheus.yml`.
- The product catalog also exports `cache_hits_total`, `cache_misses_total` and
  `cache_errors_total`, so a collapsing hit ratio or a Redis outage is visible
  in Grafana rather than only in latency.
- Traces are exported over OTLP/HTTP to Tempo (`http://tempo:4318/v1/traces`)
  when the containers pass the `OTEL_*` and `NODE_OPTIONS` settings configured
  in `infrastructure/docker-compose.yml`.
- Logs are JSON via Pino, collected from containers by Alloy into Loki.
- Grafana (port 3000) is the front end for both Prometheus and Tempo/Loki data.

Nothing is exported when running on the host without the `OTEL_*` variables;
the app still logs to stdout and serves `/metrics`.

## Production Telemetry

Production traces, errors, logs and metrics are intended to be sent to
[NestJS Observe](https://observe.nestjs.com). Until `ObserveModule` is
registered in an app module nothing is sent; `npx @nestjs/observe link` installs
`@nestjs/observe`, wires it into the app, and writes `OBSERVE_APP_KEY` /
`OBSERVE_APP_SECRET` to `.env`. See `AGENTS.md` for details.

## License

Private, unlicensed project. See `package.json` (`"license": "UNLICENSED"`).
