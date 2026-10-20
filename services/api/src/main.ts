import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
const rawPort = process.env.API_PORT ?? '3001';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('API_PORT must be a valid port');
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(port, process.env.HOST ?? '127.0.0.1');
