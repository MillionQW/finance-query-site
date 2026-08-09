import type { Market } from '../types/finance';

export interface PeerStatementPullCompany {
  market: Market;
  symbol: string;
  displaySymbol: string;
  name: string;
}

export interface PeerStatementPullProgress {
  completed: number;
  total: number;
  current: PeerStatementPullCompany;
}

export interface PeerStatementPullFailure {
  company: PeerStatementPullCompany;
  message: string;
}

export interface PeerStatementPullResult {
  completed: number;
  succeeded: PeerStatementPullCompany[];
  failed: PeerStatementPullFailure[];
  cancelled: boolean;
}

export async function pullPeerStatements(options: {
  companies: PeerStatementPullCompany[];
  signal: AbortSignal;
  pull: (company: PeerStatementPullCompany, signal: AbortSignal) => Promise<unknown>;
  onProgress?: (progress: PeerStatementPullProgress) => void;
}): Promise<PeerStatementPullResult> {
  const result: PeerStatementPullResult = {
    completed: 0,
    succeeded: [],
    failed: [],
    cancelled: false
  };

  for (const company of options.companies) {
    if (options.signal.aborted) {
      result.cancelled = true;
      break;
    }
    options.onProgress?.({ completed: result.completed, total: options.companies.length, current: company });
    try {
      await options.pull(company, options.signal);
      result.succeeded.push(company);
    } catch (error) {
      if (options.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        result.cancelled = true;
        break;
      }
      result.failed.push({
        company,
        message: error instanceof Error ? error.message : '财报拉取失败'
      });
    }
    result.completed += 1;
    options.onProgress?.({ completed: result.completed, total: options.companies.length, current: company });
  }

  return result;
}
