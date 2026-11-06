
# Build stage
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG APP_NAME

RUN npx nest build ${APP_NAME}


# Runtime stage
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

ARG APP_NAME

# Make dependencies accessible to chunks under /apps
RUN mkdir -p /apps && ln -s /app/node_modules /apps/node_modules

# Copy the application entry point
COPY --from=build /app/dist/apps/${APP_NAME}/main.js ./dist/main.js

# Copy Rspack chunks to their expected locations
COPY --from=build /app/dist/apps/${APP_NAME}/ /apps/${APP_NAME}/

CMD ["node", "dist/main.js"]
