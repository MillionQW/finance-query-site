import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { allowedWebOrigins, apiHost, apiPort, loadLocalEnvironment } from './config';
import { applyHttpPolicy } from './http-policy';
import { REQUEST_STARTED_AT } from './logging/request-exception.filter';

async function bootstrap() {
  loadLocalEnvironment();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.use(
    (
      request: { path: string; [REQUEST_STARTED_AT]?: number },
      response: { setHeader(name: string, value: string): unknown },
      next: () => void
    ) => {
      request[REQUEST_STARTED_AT] = Date.now();
      applyHttpPolicy(request.path, response);
      next();
    }
  );
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
