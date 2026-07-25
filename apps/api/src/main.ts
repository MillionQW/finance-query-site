import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { allowedWebOrigins, apiHost, apiPort, loadLocalEnvironment } from './config';
import { applyHttpPolicy } from './http-policy';

async function bootstrap() {
  loadLocalEnvironment();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.use((request: { path: string }, response: { setHeader(name: string, value: string): unknown }, next: () => void) => {
    applyHttpPolicy(request.path, response);
    next();
  });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: allowedWebOrigins(),
    credentials: false
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );

  const port = apiPort();
  const host = apiHost();
  await app.listen(port, host);
  console.log(`Finance query API listening on http://${host}:${port}`);
}

void bootstrap();
