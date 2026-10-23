import { SqliteRepository } from './sqlite.repository';
import type { Market } from '../types';
import type { ValuationModelDto, ValuationSnapshot } from '../valuation-model.dto';
import { normalizeSymbol } from './finance-store.utils';

export class ValuationModelRepository extends SqliteRepository {
  list(market: Market, symbol: string): ValuationSnapshot[] {
    return this.db.prepare(`SELECT id, saved_at, payload_json FROM company_valuation_models
      WHERE market = ? AND symbol = ? ORDER BY id DESC LIMIT 30`).all(market, normalizeSymbol(market, symbol))
      .map((r: any) => ({ id: r.id, savedAt: r.saved_at, model: JSON.parse(r.payload_json) }));
  }
  save(market: Market, symbol: string, model: ValuationModelDto): ValuationSnapshot {
    const savedAt = new Date().toISOString();
    const result = this.db.prepare(`INSERT INTO company_valuation_models (market, symbol, saved_at, payload_json) VALUES (?, ?, ?, ?)`)
      .run(market, normalizeSymbol(market, symbol), savedAt, JSON.stringify(model));
    return { id: Number(result.lastInsertRowid), savedAt, model };
  }
}
