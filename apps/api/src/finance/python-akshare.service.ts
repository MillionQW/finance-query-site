import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runtimeRoot } from '../config';
import { join, resolve } from 'node:path';

interface BridgeResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    detail?: string;
  };
}

@Injectable()
export class PythonAkshareService {
  private readonly logger = new Logger(PythonAkshareService.name);
  private readonly pythonBin = this.resolvePythonBin();
  private readonly bridgePath = this.resolveBridgePath();
  private readonly defaultTimeoutMs = this.readTimeout(process.env.AKSHARE_TIMEOUT_MS, 120_000);
  private readonly maxOutputBytes = this.readByteLimit(
    process.env.AKSHARE_MAX_OUTPUT_BYTES,
    25 * 1024 * 1024
  );
  private readonly exposeErrorDetails = process.env.AKSHARE_EXPOSE_ERROR_DETAILS === 'true';

  async run<T>(args: string[], timeoutMs = this.defaultTimeoutMs, signal?: AbortSignal, onProgress?: (data: T) => void): Promise<T> {
    if (!existsSync(this.bridgePath)) {
      throw new HttpException(
        `AKShare bridge not found: ${this.bridgePath}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    const output = await this.spawnBridge(args, timeoutMs, signal, onProgress);
    let parsed: BridgeResult<T>;
    try {
      parsed = JSON.parse(output) as BridgeResult<T>;
    } catch (error) {
      this.logger.error(`Invalid bridge JSON: ${this.truncateForLog(output)}`);
      throw new HttpException(
        'Python AKShare bridge returned invalid JSON.',
        HttpStatus.BAD_GATEWAY
      );
    }

    if (!parsed.ok) {
      if (parsed.error?.detail) {
        this.logger.warn(this.truncateForLog(parsed.error.detail));
      }
      throw new HttpException(
        {
          message: parsed.error?.message ?? 'AKShare request failed.',
          code: parsed.error?.code ?? 'AKSHARE_ERROR',
          ...(this.exposeErrorDetails && parsed.error?.detail
            ? { detail: parsed.error.detail }
            : {})
        },
        HttpStatus.BAD_GATEWAY
      );
    }

    return parsed.data as T;
  }

  private resolveBridgePath(): string {
    const candidates = [
      resolve(process.cwd(), 'apps', 'api', 'src', 'python', 'akshare_bridge.py'),
      resolve(process.cwd(), 'src', 'python', 'akshare_bridge.py'),
      join(__dirname, '..', 'python', 'akshare_bridge.py'),
      join(__dirname, '..', '..', 'src', 'python', 'akshare_bridge.py')
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }

  private resolvePythonBin(): string {
    const candidates = [
      process.env.PYTHON_BIN,
      resolve(process.cwd(), '.venv', 'Scripts', 'python.exe'),
      resolve(process.cwd(), '..', '..', '.venv', 'Scripts', 'python.exe'),
      'python'
    ].filter(Boolean) as string[];

    return candidates.find((candidate) => candidate === 'python' || existsSync(candidate)) ?? 'python';
  }

  private spawnBridge(args: string[], timeoutMs?: number, signal?: AbortSignal, onProgress?: (data: any) => void): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const jobId = randomUUID();
      const started = Date.now();
      const log = (event: string) => {
        if (args[0] !== 'statements') return;
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        try {
          const directory = join(runtimeRoot(), 'data', 'logs');
          mkdirSync(directory, { recursive: true });
          appendFileSync(join(directory, `upstream-requests-${date}-${jobId}.jsonl`), JSON.stringify({
            timestamp: now.toISOString(), event, jobId, command: args,
            durationMs: Date.now() - started
          }) + '\n');
        } catch { /* Diagnostics must not interrupt requests. */ }
      };
      log('bridge_started');
      const child = spawn(this.pythonBin, [this.bridgePath, ...args], {
        cwd: resolve(__dirname, '..', '..'),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          AKSHARE_TRACE_ID: jobId
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      const killBridge = () => {
        // The Windows venv launcher owns a second Python process.
        if (process.platform === 'win32' && child.pid) {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.on('error', () => child.kill('SIGKILL'));
        } else child.kill('SIGKILL');
      };

      let stdout = '';
      let pendingLine = '';
      let stderr = '';
      let outputBytes = 0;
      let settled = false;
      const timeout = timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            log('bridge_timeout');
            signal?.removeEventListener('abort', cancel);
            killBridge();
            reject(
              new HttpException(
                  {
                    message: 'Python AKShare bridge timed out.',
                    code: 'PYTHON_BRIDGE_TIMEOUT',
                    ...(this.exposeErrorDetails
                      ? { detail: `Command exceeded ${timeoutMs}ms: ${args.join(' ')}` }
                      : {})
                  },
                HttpStatus.BAD_GATEWAY
              )
            );
          }, timeoutMs)
        : null;

      const finish = <T>(callback: () => T): T | undefined => {
        if (settled) return undefined;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        if (timeout) clearTimeout(timeout);
        return callback();
      };

      const cancel = () => finish(() => {
        log('bridge_cancelled');
        killBridge();
        reject(new HttpException('Search cancelled.', HttpStatus.REQUEST_TIMEOUT));
      });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (onProgress) {
          pendingLine += chunk;
          if (Buffer.byteLength(pendingLine) > this.maxOutputBytes) {
            finish(() => { killBridge(); reject(new Error('Statement stream frame too large')); });
            return;
          }
          let newline: number;
          while ((newline = pendingLine.indexOf('\n')) >= 0) {
            const line = pendingLine.slice(0, newline);
            pendingLine = pendingLine.slice(newline + 1);
            if (!line.trim()) continue;
            try {
              const message = JSON.parse(line);
              if (message.progress) onProgress(message.data);
              else stdout = line;
            } catch (error) {
              finish(() => { killBridge(); reject(error); });
            }
          }
          return;
        }
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > this.maxOutputBytes) {
          finish(() => {
            killBridge();
            reject(
              new HttpException(
                {
                  message: 'Python AKShare bridge returned too much data.',
                  code: 'PYTHON_BRIDGE_OUTPUT_LIMIT'
                },
                HttpStatus.BAD_GATEWAY
              )
            );
          });
          return;
        }
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > this.maxOutputBytes) {
          finish(() => {
            killBridge();
            reject(
              new HttpException(
                {
                  message: 'Python AKShare bridge returned too much data.',
                  code: 'PYTHON_BRIDGE_OUTPUT_LIMIT'
                },
                HttpStatus.BAD_GATEWAY
              )
            );
          });
          return;
        }
        stderr += chunk;
      });

      child.on('error', (error) => {
        log('bridge_error');
        finish(() =>
          reject(
            new HttpException(
              `Unable to start Python: ${error.message}`,
              HttpStatus.BAD_GATEWAY
            )
          )
        );
      });

      child.on('close', (code) => {
        log(code === 0 ? 'bridge_finished' : 'bridge_failed');
        finish(() => {
          if (code !== 0) {
            this.logger.error(this.truncateForLog(stderr || stdout));
            reject(
              new HttpException(
                {
                  message: 'Python AKShare bridge failed.',
                  code: 'PYTHON_BRIDGE_FAILED',
                  ...(this.exposeErrorDetails
                    ? { detail: stderr || stdout }
                    : {})
                },
                HttpStatus.BAD_GATEWAY
              )
            );
            return;
          }

          resolvePromise(stdout.trim());
        });
      });
    });
  }

  private readTimeout(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 10 * 60_000
      ? Math.floor(parsed)
      : fallback;
  }

  private readByteLimit(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1024 * 1024 && parsed <= 100 * 1024 * 1024
      ? Math.floor(parsed)
      : fallback;
  }

  private truncateForLog(value: string, maxLength = 4_000): string {
    return value.length <= maxLength
      ? value
      : `${value.slice(0, maxLength)}… [truncated ${value.length - maxLength} chars]`;
  }
}
