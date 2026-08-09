import { HttpException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { requestErrorLogOptions } from './request-error-log.config';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOG_FILE_PATTERN = /^request-errors-\d{4}-\d{2}-\d{2}\.log$/;
const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i;

export interface RequestFailure {
  method?: string;
  url?: string;
  statusCode: number;
  durationMs?: number;
  exception: unknown;
}

@Injectable()
export class RequestErrorLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestErrorLogService.name);
  private readonly options = requestErrorLogOptions();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private ready = false;

  async onModuleInit(): Promise<void> {
    if (!this.options.enabled) {
      this.logger.log('Request error file logging is disabled.');
      return;
    }

    try {
      await mkdir(this.options.directory, { recursive: true });
      this.ready = true;
    } catch (error) {
      this.logger.error(`Unable to initialize request error logs: ${errorMessage(error)}`);
      return;
    }

    await this.cleanupExpiredLogs().catch((error) => {
      this.logger.error(`Unable to clean request error logs: ${errorMessage(error)}`);
    });

    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredLogs().catch((error) => {
        this.logger.error(`Unable to clean request error logs: ${errorMessage(error)}`);
      });
    }, this.options.cleanupIntervalHours * HOUR_MS);
    this.cleanupTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.writeQueue;
  }

  logFailure(failure: RequestFailure): void {
    if (!this.ready) return;

    const now = new Date();
    const entry = {
      timestamp: now.toISOString(),
      level: 'error',
      event: 'http_request_failed',
      request: {
        method: truncate(failure.method?.toUpperCase() || 'UNKNOWN', 16),
        url: sanitizeUrl(failure.url || '/')
      },
      response: {
        statusCode: failure.statusCode,
        ...(failure.durationMs === undefined
          ? {}
          : { durationMs: Math.max(0, Math.round(failure.durationMs)) })
      },
      error: serializeException(failure.exception)
    };
    const filePath = join(this.options.directory, `request-errors-${localDate(now)}.log`);

    this.writeQueue = this.writeQueue
      .then(() => appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8'))
      .catch((error) => {
        this.logger.error(`Unable to write request error log: ${errorMessage(error)}`);
      });
  }

  private async cleanupExpiredLogs(now = Date.now()): Promise<void> {
    const entries = await readdir(this.options.directory, { withFileTypes: true });
    const expiresBefore = now - this.options.retentionDays * DAY_MS;

    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !LOG_FILE_PATTERN.test(entry.name)) return;

      const filePath = join(this.options.directory, entry.name);
      const fileStat = await stat(filePath);
      if (fileStat.mtimeMs < expiresBefore) {
        await unlink(filePath);
      }
    }));
  }
}

function serializeException(exception: unknown): Record<string, unknown> {
  if (exception instanceof HttpException) {
    return {
      name: exception.name,
      message: truncate(exception.message, 4_000),
      details: sanitizeValue(exception.getResponse()),
      ...(exception.stack ? { stack: truncate(exception.stack, 16_000) } : {})
    };
  }

  if (exception instanceof Error) {
    return {
      name: exception.name,
      message: truncate(exception.message, 4_000),
      ...(exception.stack ? { stack: truncate(exception.stack, 16_000) } : {})
    };
  }

  return {
    name: 'UnknownError',
    message: truncate(String(exception), 4_000)
  };
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value, 'http://localhost');
    for (const key of [...url.searchParams.keys()]) {
      const values = url.searchParams.getAll(key);
      url.searchParams.delete(key);
      for (const queryValue of values) {
        url.searchParams.append(
          key,
          SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : truncate(queryValue, 512)
        );
      }
    }
    return truncate(`${url.pathname}${url.search}`, 4_000);
  } catch {
    return truncate(value.split('?')[0] || '/', 4_000);
  }
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth >= 4) return '[TRUNCATED]';
  if (typeof value === 'string') return truncate(value, 2_000);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== 'object') return truncate(String(value), 2_000);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeValue(item, depth + 1)
      ])
  );
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...[truncated]`;
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
