import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { FinanceModule } from './finance/finance.module';
import { applyStaticCachePolicy } from './http-policy';
import { RequestLoggingModule } from './logging/request-logging.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)'],
      serveStaticOptions: {
        setHeaders: (response, filePath) => applyStaticCachePolicy(filePath, response)
      }
    }),
    RequestLoggingModule,
    FinanceModule
  ]
})
export class AppModule {}
