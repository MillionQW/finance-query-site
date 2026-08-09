import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RequestErrorLogService } from './request-error-log.service';
import { RequestExceptionFilter } from './request-exception.filter';

@Module({
  providers: [
    RequestErrorLogService,
    {
      provide: APP_FILTER,
      useClass: RequestExceptionFilter
    }
  ]
})
export class RequestLoggingModule {}
