#!/bin/sh
set -eu

# Apply this service's Prisma migrations before starting the app.
# Services without a database (api-gateway) ship no Prisma config and skip this.
# Set RUN_MIGRATIONS=false to skip, for example in a one-off shell.
if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  if [ -f ./prisma-migrations/prisma.config.ts ]; then
    echo "[entrypoint] applying Prisma migrations for ${APP_NAME}"
    node ./node_modules/prisma/build/index.js migrate deploy \
      --config ./prisma-migrations/prisma.config.ts
  else
    echo "[entrypoint] ${APP_NAME} has no database, skipping migrations"
  fi
fi

exec "$@"
