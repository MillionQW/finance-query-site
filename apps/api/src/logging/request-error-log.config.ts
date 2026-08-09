import { resolve } from 'node:path';
import { runtimeRoot } from '../config';

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_CLEANUP_INTERVAL_HOURS = 24;

export interface RequestErrorLogOptions {
  enabled: boolean;
  directory: string;
  retentionDays: number;
  cleanupIntervalHours: number;
}

export function requestErrorLogOptions(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): RequestErrorLogOptions {
  return {
    enabled: env.REQUEST_ERROR_LOG_ENABLED !== 'false',
    directory: resolve(runtimeRoot(cwd), env.REQUEST_ERROR_LOG_DIR?.trim() || 'data/logs'),
    retentionDays: readPositiveInteger(
      env.REQUEST_ERROR_LOG_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS
    ),
    cleanupIntervalHours: readPositiveNumber(
      env.REQUEST_ERROR_LOG_CLEANUP_INTERVAL_HOURS,
      DEFAULT_CLEANUP_INTERVAL_HOURS
    )
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
