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
```

| Service | Port | Database | Responsibility |
|---|---|---|---|
| `api-gateway` | 3000 | – | Single public API surface: auth, validation, routing to services |
| `product-catalog-service` | 3001 | `product_catalog` | Products, search, filtering, inventory |
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

## Quick Start

### With Docker

```bash
# 1. Install dependencies (needed for Prisma CLI and migrations)
npm install

# 2. Create a root .env with the variables listed below
#    (at minimum JWT_SECRET and the five *_DATABASE_URL values)

# 3. Start Postgres only, then apply migrations
cd infrastructure
docker compose up -d postgres
cd ..

npx prisma migrate deploy --config apps/product-catalog-service/prisma.config.ts
npx prisma migrate deploy --config apps/user-service/prisma.config.ts
npx prisma migrate deploy --config apps/shopping-cart-service/prisma.config.ts
npx prisma migrate deploy --config apps/order-service/prisma.config.ts
npx prisma migrate deploy --config apps/payment-service/prisma.config.ts

# 4. Start the rest of the stack
cd infrastructure
JWT_SECRET=<your-secret> docker compose up -d
```

The compose file lives in `infrastructure/` and reads `JWT_SECRET` from the
environment (or from `infrastructure/.env`), so pass or export it when starting
the stack. Containers do **not** run migrations on boot — the `postgres` init
script in `infrastructure/postgres/init/` only creates the extra databases.

Once running:

| URL | What |
|---|---|
| http://localhost | API, via nginx → `api-gateway` |
| http://localhost:3000 | Grafana |
| http://localhost:9090 | Prometheus |
| localhost:5432 | PostgreSQL (`ecommerce` / `ecommerce_dev`) |

Rebuild images after code changes:

```bash
cd infrastructure && docker compose up -d --build
```

### Without Docker

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` in the repo root with the variables from
   [Environment Variables](#environment-variables).

3. Create the databases (either use the init script or `createdb`):

```bash
psql -U ecommerce -d postgres -f infrastructure/postgres/init/01-create-databases.sql
```

4. Apply Prisma migrations (the same five commands as above).

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
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:integration` | Integration tests (`*.integration.spec.ts`) |
| `npm run test:e2e` | E2E tests (`*.e2e.spec.ts`) |

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
| `*_TEST_DATABASE_URL` | tests | Test databases (see CI) |
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
JWT_SECRET="<a-long-random-string>"
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
│   ├── postgres/init/            # Creates the per-service databases
│   ├── prometheus/               # Scrape config for all six services
│   └── loki/, alloy/, tempo/     # Log and trace pipelines
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

## Testing

```bash
npm test                 # unit tests
npm run test:integration # integration tests (need the test databases)
npm run test:e2e         # E2E tests (boots real services against test DBs)
```

Integration and E2E suites expect the test databases from `.env` to exist and
to be migrated; E2E files run sequentially because they share and truncate
those databases. `npm run test:e2e` also needs `JWT_SECRET` set.

## Observability

- Every service exposes Prometheus metrics at `/metrics`; Prometheus scrapes
  all six in `infrastructure/prometheus/prometheus.yml`.
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
