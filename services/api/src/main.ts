import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
const rawPort = process.env.API_PORT ?? '3001';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('API_PORT must be a valid port');
const app = await NestFactory.create<NestExpressApplication>(AppModule);
// The JSON envelope can carry multiple configured texts and expands escaped characters.
app.useBodyParser('json', { limit: '1mb' });
app.enableShutdownHooks();
await app.listen(port, process.env.HOST ?? '127.0.0.1');
