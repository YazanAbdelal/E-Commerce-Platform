import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule); // creates the NestJS application.
  await app.listen(process.env.PORT ?? 3000); // starts the HTTP server.
}
await bootstrap(); // initializes everything.
