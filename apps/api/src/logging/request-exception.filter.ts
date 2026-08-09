import { ArgumentsHost, Catch, Inject, Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BaseExceptionFilter } from '@nestjs/core';
import { RequestErrorLogService } from './request-error-log.service';

export const REQUEST_STARTED_AT = Symbol('requestStartedAt');

interface LoggedRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  [REQUEST_STARTED_AT]?: number;
}

@Catch()
@Injectable()
export class RequestExceptionFilter extends BaseExceptionFilter {
  constructor(
    @Inject(RequestErrorLogService) private readonly requestErrorLog: RequestErrorLogService,
    @Inject(HttpAdapterHost) adapterHost: HttpAdapterHost
  ) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'http') {
      const context = host.switchToHttp();
      const request = context.getRequest<LoggedRequest>();
      const response = context.getResponse<{ statusCode?: number }>();
      const startedAt = request[REQUEST_STARTED_AT];
      const statusCode = getExceptionStatus(exception, response.statusCode);

      this.requestErrorLog.logFailure({
        method: request.method,
        url: request.originalUrl || request.url,
        statusCode,
        durationMs: startedAt === undefined ? undefined : Date.now() - startedAt,
        exception
      });
    }

    super.catch(exception, host);
  }
}

function getExceptionStatus(exception: unknown, responseStatus?: number): number {
  if (
    typeof exception === 'object'
    && exception !== null
    && 'getStatus' in exception
    && typeof exception.getStatus === 'function'
  ) {
    const status = exception.getStatus();
    if (typeof status === 'number') return status;
  }
  return responseStatus && responseStatus >= 400 ? responseStatus : 500;
}
