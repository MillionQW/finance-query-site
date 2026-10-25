import { ConflictException, NotFoundException } from '@nestjs/common';
import { SqliteRepository } from './sqlite.repository';
import type { Holding, HoldingInput, PortfolioQuote } from '../portfolio.types';

export class PortfolioRepository extends SqliteRepository {
  constructor(db: any) {
    super(db);
    db.exec(`CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, market TEXT NOT NULL, symbol TEXT NOT NULL,
      version INTEGER NOT NULL, payload_json TEXT NOT NULL, UNIQUE(market,symbol));
      CREATE TABLE IF NOT EXISTS portfolio_quotes (key TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS portfolio_valuation_history (
        holding_id INTEGER NOT NULL, recorded_at TEXT NOT NULL, valuation TEXT NOT NULL);`);
  }

  list(): Holding[] {
    return this.db.prepare('SELECT payload_json FROM portfolio_holdings ORDER BY id').all()
      .map((r: any) => {
        // Old percentages cannot establish a monetary holding value. Keep the
        // stored legacy payload untouched until the user explicitly edits it.
        const { weight: _legacyWeight, ...record } = JSON.parse(r.payload_json);
        return { ...record, holdingValue: record.holdingValue ?? null, holdingCurrency: record.holdingCurrency ?? 'CNY' };
      });
  }

  save(id: number | null, input: HoldingInput, now = new Date().toISOString()): Holding {
    return this.withTransaction(() => {
      const oldRow = id === null ? null : this.db.prepare('SELECT * FROM portfolio_holdings WHERE id=?').get(id);
      if (id !== null && !oldRow) throw new NotFoundException('该公司已被移除，请刷新列表');
      const old: Holding | null = oldRow ? JSON.parse(oldRow.payload_json) : null;
      if ((old?.version ?? 0) !== input.expectedVersion) throw new ConflictException('此记录已在其他页面修改，请关闭编辑并重新载入后再试');
      if (old && (old.market !== input.market || old.symbol !== input.symbol)) throw new ConflictException('不能修改已添加公司的代码');
      if (!old && this.db.prepare('SELECT id FROM portfolio_holdings WHERE market=? AND symbol=?').get(input.market, input.symbol)) {
        throw new ConflictException('该公司已经在表格中');
      }
      const { confirmValuation, expectedVersion, ...fields } = input;
      const changed = Boolean(fields.valuation) && (fields.valuation !== old?.valuation || confirmValuation);
      const record: Holding = { ...fields, id: id ?? 0, version: expectedVersion + 1, updatedAt: now,
        valuationUpdatedAt: !fields.valuation ? null : changed ? now : old?.valuationUpdatedAt ?? null };
      if (id === null) {
        record.id = Number(this.db.prepare('INSERT INTO portfolio_holdings(market,symbol,version,payload_json) VALUES (?,?,?,?)')
          .run(record.market, record.symbol, record.version, '{}').lastInsertRowid);
      }
      this.db.prepare('UPDATE portfolio_holdings SET version=?,payload_json=? WHERE id=?').run(record.version, JSON.stringify(record), record.id);
      if (changed) this.db.prepare('INSERT INTO portfolio_valuation_history VALUES (?,?,?)').run(record.id, now, record.valuation);
      return record;
    });
  }

  remove(id: number, version: number) {
    const result = this.db.prepare('DELETE FROM portfolio_holdings WHERE id=? AND version=?').run(id, version);
    if (!result.changes) throw new ConflictException('记录已变化，请重新载入后再移除');
    return { removed: true };
  }

  getQuote(key: string): PortfolioQuote | null {
    const row = this.db.prepare('SELECT payload_json FROM portfolio_quotes WHERE key=?').get(key);
    return row ? JSON.parse(row.payload_json) : null;
  }
  saveQuote(key: string, quote: PortfolioQuote) {
    this.db.prepare('INSERT INTO portfolio_quotes VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload_json=excluded.payload_json')
      .run(key, JSON.stringify(quote));
  }
}
