# Build stage
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG APP_NAME

RUN npx nest build ${APP_NAME}

# Collect the Prisma schema, migrations and config into a single directory.
# Services without a database (api-gateway) end up with an empty bundle.
RUN mkdir -p /prisma && \
    if [ -d "apps/${APP_NAME}/prisma" ]; then cp -r "apps/${APP_NAME}/prisma" /prisma/prisma; fi && \
    if [ -f "apps/${APP_NAME}/prisma.config.ts" ]; then cp "apps/${APP_NAME}/prisma.config.ts" /prisma/prisma.config.ts; fi && \
    touch /prisma/.keep


# Runtime stage
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Prisma's schema engine needs OpenSSL to pick the right engine binary.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

# Make dependencies accessible to chunks under /apps
RUN mkdir -p /apps && ln -s /app/node_modules /apps/node_modules

# Copy the application entry point
COPY --from=build /app/dist/apps/${APP_NAME}/main.js ./dist/main.js

# Copy Rspack chunks to their expected locations
COPY --from=build /app/dist/apps/${APP_NAME}/ /apps/${APP_NAME}/

# Copy the Prisma bundle used by `prisma migrate deploy` on startup.
# The config keeps working because its relative paths (./prisma/...) are preserved.
COPY --from=build /prisma/ ./prisma-migrations/

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
