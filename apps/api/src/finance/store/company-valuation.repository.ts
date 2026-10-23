import type { CompanyPeHistory } from '../company-valuation.types';
import type { Market } from '../types';

export class CompanyValuationRepository {
  constructor(private readonly db: any) {}

  get(market: Market, symbol: string): CompanyPeHistory | null {
    const row = this.db.prepare(
      'SELECT payload_json FROM company_pe_history WHERE market = ? AND symbol = ?'
    ).get(market, symbol);
    return row ? JSON.parse(row.payload_json) : null;
  }

  save(payload: CompanyPeHistory): void {
    this.db.prepare(`
      INSERT INTO company_pe_history (market, symbol, fetched_at, payload_json) VALUES (?, ?, ?, ?)
      ON CONFLICT(market, symbol) DO UPDATE SET
        fetched_at = excluded.fetched_at, payload_json = excluded.payload_json
    `).run(payload.market, payload.symbol, payload.fetchedAt, JSON.stringify(payload));
  }
}
