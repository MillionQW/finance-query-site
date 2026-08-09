import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

const DEFAULT_WEB_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

export function loadLocalEnvironment(cwd = process.cwd()): void {
  const envPath = [resolve(cwd, '.env'), resolve(runtimeRoot(cwd), '.env')]
    .find((candidate, index, candidates) => (
      candidates.indexOf(candidate) === index && existsSync(candidate)
    ));
  if (envPath) {
    loadEnvFile(envPath);
  }
}

export function runtimeRoot(cwd = process.cwd()): string {
  const candidates = [cwd, resolve(cwd, '..', '..')];
  return candidates.find((candidate) => (
    existsSync(resolve(candidate, 'package.json'))
    && existsSync(resolve(candidate, 'apps', 'api'))
  )) ?? cwd;
}

export function apiHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOST?.trim() || '127.0.0.1';
}

export function apiPort(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.PORT ?? 3000);
  return Number.isInteger(value) && value >= 1 && value <= 65_535 ? value : 3000;
}

export function allowedWebOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.WEB_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? [...new Set(configured)] : DEFAULT_WEB_ORIGINS;
}
