import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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

  async run<T>(args: string[], timeoutMs?: number): Promise<T> {
    if (!existsSync(this.bridgePath)) {
      throw new HttpException(
        `AKShare bridge not found: ${this.bridgePath}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    const output = await this.spawnBridge(args, timeoutMs);
    let parsed: BridgeResult<T>;
    try {
      parsed = JSON.parse(output) as BridgeResult<T>;
    } catch (error) {
      this.logger.error(`Invalid bridge JSON: ${output}`);
      throw new HttpException(
        'Python AKShare bridge returned invalid JSON.',
        HttpStatus.BAD_GATEWAY
      );
    }

    if (!parsed.ok) {
      throw new HttpException(
        {
          message: parsed.error?.message ?? 'AKShare request failed.',
          code: parsed.error?.code ?? 'AKSHARE_ERROR',
          detail: parsed.error?.detail
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

  private spawnBridge(args: string[], timeoutMs?: number): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.pythonBin, [this.bridgePath, ...args], {
        cwd: resolve(__dirname, '..', '..'),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout = timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(
              new HttpException(
                {
                  message: 'Python AKShare bridge timed out.',
                  code: 'PYTHON_BRIDGE_TIMEOUT',
                  detail: `Command exceeded ${timeoutMs}ms: ${args.join(' ')}`
                },
                HttpStatus.BAD_GATEWAY
              )
            );
          }, timeoutMs)
        : null;

      const finish = <T>(callback: () => T): T | undefined => {
        if (settled) return undefined;
        settled = true;
        if (timeout) clearTimeout(timeout);
        return callback();
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      child.on('error', (error) => {
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
        finish(() => {
          if (code !== 0) {
            this.logger.error(stderr || stdout);
            reject(
              new HttpException(
                {
                  message: 'Python AKShare bridge failed.',
                  code: 'PYTHON_BRIDGE_FAILED',
                  detail: stderr || stdout
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
}
