import { BadRequestException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { requestErrorLogOptions } from './request-error-log.config';
import { RequestErrorLogService } from './request-error-log.service';
import { RequestLoggingModule } from './request-logging.module';

class RequestLoggingTestModule {}
Module({ imports: [RequestLoggingModule] })(RequestLoggingTestModule);

test('request error log settings have safe local defaults', () => {
  const options = requestErrorLogOptions({}, 'D:\\finance-query-site');
  assert.equal(options.enabled, true);
  assert.equal(options.directory, 'D:\\finance-query-site\\data\\logs');
  assert.equal(options.retentionDays, 14);
  assert.equal(options.cleanupIntervalHours, 24);
});

test('failed requests are logged with sensitive values redacted and stale logs removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-request-error-log-'));
  const previousEnvironment = {
    directory: process.env.REQUEST_ERROR_LOG_DIR,
    retentionDays: process.env.REQUEST_ERROR_LOG_RETENTION_DAYS,
    cleanupHours: process.env.REQUEST_ERROR_LOG_CLEANUP_INTERVAL_HOURS
  };

  try {
    process.env.REQUEST_ERROR_LOG_DIR = directory;
    process.env.REQUEST_ERROR_LOG_RETENTION_DAYS = '1';
    process.env.REQUEST_ERROR_LOG_CLEANUP_INTERVAL_HOURS = '24';

    await mkdir(directory, { recursive: true });
    const staleLog = join(directory, 'request-errors-2020-01-01.log');
    const unrelatedFile = join(directory, 'keep.txt');
    await writeFile(staleLog, 'stale\n', 'utf8');
    await writeFile(unrelatedFile, 'keep\n', 'utf8');
    const oldDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await utimes(staleLog, oldDate, oldDate);
    await utimes(unrelatedFile, oldDate, oldDate);

    const service = new RequestErrorLogService();
    await service.onModuleInit();
    service.logFailure({
      method: 'get',
      url: '/api/finance/statements?symbol=600519&token=private-value',
      statusCode: 400,
      durationMs: 12.6,
      exception: new BadRequestException({ message: 'Invalid request', apiKey: 'private-key' })
    });
    await service.onModuleDestroy();

    await assert.rejects(stat(staleLog));
    assert.equal((await readFile(unrelatedFile, 'utf8')).trim(), 'keep');

    const logFiles = (await readdir(directory)).filter((name) => name.startsWith('request-errors-'));
    assert.equal(logFiles.length, 1);
    const logged = JSON.parse((await readFile(join(directory, logFiles[0]), 'utf8')).trim());
    assert.equal(logged.event, 'http_request_failed');
    assert.equal(logged.request.method, 'GET');
    assert.match(logged.request.url, /symbol=600519/);
    assert.doesNotMatch(logged.request.url, /private-value/);
    assert.equal(logged.response.statusCode, 400);
    assert.equal(logged.response.durationMs, 13);
    assert.equal(logged.error.details.apiKey, '[REDACTED]');
  } finally {
    restoreEnvironment('REQUEST_ERROR_LOG_DIR', previousEnvironment.directory);
    restoreEnvironment('REQUEST_ERROR_LOG_RETENTION_DAYS', previousEnvironment.retentionDays);
    restoreEnvironment('REQUEST_ERROR_LOG_CLEANUP_INTERVAL_HOURS', previousEnvironment.cleanupHours);
    await rm(directory, { recursive: true, force: true });
  }
});

test('the global exception filter preserves the response and writes the failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-request-filter-'));
  const previousDirectory = process.env.REQUEST_ERROR_LOG_DIR;
  process.env.REQUEST_ERROR_LOG_DIR = directory;
  const app = await NestFactory.create(RequestLoggingTestModule, {
    logger: false,
    abortOnError: false
  });

  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/missing?token=must-not-appear&symbol=600519`
    );

    assert.equal(response.status, 404);
    await app.close();

    const logFile = (await readdir(directory)).find((name) => name.startsWith('request-errors-'));
    assert.ok(logFile);
    const logged = JSON.parse((await readFile(join(directory, logFile), 'utf8')).trim());
    assert.equal(logged.request.method, 'GET');
    assert.equal(logged.response.statusCode, 404);
    assert.match(logged.request.url, /symbol=600519/);
    assert.doesNotMatch(logged.request.url, /must-not-appear/);
  } finally {
    await app.close().catch(() => undefined);
    restoreEnvironment('REQUEST_ERROR_LOG_DIR', previousDirectory);
    await rm(directory, { recursive: true, force: true });
  }
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
