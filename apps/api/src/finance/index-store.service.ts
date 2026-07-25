import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { INDEX_CATALOG } from './index-catalog';
import { FavoriteIndex, IndexHistoryPayload, IndexHistoryPoint, IndexMarket, IndexQuote, IndexValuation } from './index.types';

const nodeRequire = createRequire(__filename);
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (path: string) => any };

@Injectable()
export class IndexStoreService implements OnModuleDestroy {
  private readonly db: any;

  constructor() {
    const dbPath = this.resolveDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `);
    this.initializeSchema();
  }

  onModuleDestroy(): void { this.db.close(); }

  saveQuotes(quotes: IndexQuote[]): void {
    const stmt = this.db.prepare(`INSERT INTO indices (
      market,symbol,display_symbol,name,category,latest_price,change_amount,change_percent,volume,amount,
      open_price,high_price,low_price,previous_close,quote_updated_at,source,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(market,symbol) DO UPDATE SET
      display_symbol=excluded.display_symbol,name=excluded.name,category=excluded.category,
      latest_price=excluded.latest_price,change_amount=excluded.change_amount,change_percent=excluded.change_percent,
      volume=excluded.volume,amount=excluded.amount,open_price=excluded.open_price,high_price=excluded.high_price,
      low_price=excluded.low_price,previous_close=excluded.previous_close,quote_updated_at=excluded.quote_updated_at,
      source=excluded.source,updated_at=datetime('now')`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const q of quotes) stmt.run(q.market,q.symbol,q.displaySymbol,q.name,q.category,q.latestPrice,q.changeAmount,q.changePercent,q.volume,q.amount,q.open,q.high,q.low,q.previousClose,q.quoteUpdatedAt,q.source);
      this.setRefresh('market');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  listQuotes(query = '', market = 'all'): IndexQuote[] {
    const rows = this.db.prepare(`SELECT * FROM indices WHERE (?='all' OR market=?) AND (symbol LIKE ? OR name LIKE ? OR display_symbol LIKE ?) ORDER BY CASE category WHEN '核心宽基' THEN 1 WHEN '成长与科技' THEN 2 WHEN '北交所' THEN 3 ELSE 4 END, symbol`).all(market,market,`%${query}%`,`%${query}%`,`%${query}%`);
    return rows.map((row: any) => this.toQuote(row));
  }

  getQuote(market: IndexMarket, symbol: string): IndexQuote | null {
    const row = this.db.prepare('SELECT * FROM indices WHERE market=? AND symbol=?').get(market,symbol);
    return row ? this.toQuote(row) : null;
  }

  countQuotes(): number { return Number(this.db.prepare('SELECT COUNT(*) count FROM indices').get()?.count ?? 0); }

  saveHistory(payload: IndexHistoryPayload): void {
    const stmt = this.db.prepare(`INSERT INTO index_daily_prices (market,symbol,trade_date,open_price,close_price,high_price,low_price,volume,amount,change_percent,change_amount,source,fetched_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(market,symbol,trade_date) DO UPDATE SET open_price=excluded.open_price,close_price=excluded.close_price,high_price=excluded.high_price,low_price=excluded.low_price,volume=excluded.volume,amount=excluded.amount,change_percent=excluded.change_percent,change_amount=excluded.change_amount,source=excluded.source,fetched_at=excluded.fetched_at`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const p of payload.points) stmt.run(payload.market,payload.symbol,p.date,p.open,p.close,p.high,p.low,p.volume,p.amount,p.changePercent,p.changeAmount,payload.source,payload.fetchedAt);
      const latest=payload.points.at(-1),previous=payload.points.at(-2);
      if(latest) this.db.prepare(`UPDATE indices SET latest_price=?,change_amount=?,change_percent=?,volume=?,amount=?,open_price=?,high_price=?,low_price=?,previous_close=?,quote_updated_at=?,source=?,updated_at=datetime('now') WHERE market=? AND symbol=? AND latest_price IS NULL`)
        .run(latest.close,latest.changeAmount,latest.changePercent,latest.volume,latest.amount,latest.open,latest.high,latest.low,previous?.close??null,payload.fetchedAt,payload.source,payload.market,payload.symbol);
      this.setRefresh(`history:${payload.market}:${payload.symbol}`);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  getHistory(market: IndexMarket, symbol: string, startDate: string): IndexHistoryPoint[] {
    return this.db.prepare('SELECT * FROM index_daily_prices WHERE market=? AND symbol=? AND trade_date>=? ORDER BY trade_date').all(market,symbol,startDate).map((r: any) => ({ date:r.trade_date,open:r.open_price,close:r.close_price,high:r.high_price,low:r.low_price,volume:r.volume,amount:r.amount,changePercent:r.change_percent,changeAmount:r.change_amount }));
  }

  getRefresh(key: string): string | null { return this.db.prepare('SELECT refreshed_at FROM index_refresh_state WHERE cache_key=?').get(key)?.refreshed_at ?? null; }
  getFavorites(): FavoriteIndex[] { return this.db.prepare('SELECT i.*,f.favorited_at FROM favorite_indices f JOIN indices i ON i.market=f.market AND i.symbol=f.symbol ORDER BY f.favorited_at DESC').all().map((r:any) => ({...this.toQuote(r),favoritedAt:r.favorited_at})); }
  saveFavorite(market: IndexMarket,symbol:string): FavoriteIndex[] { this.db.prepare("INSERT OR IGNORE INTO favorite_indices VALUES (?,?,datetime('now'))").run(market,symbol); return this.getFavorites(); }
  removeFavorite(market: IndexMarket,symbol:string): FavoriteIndex[] { this.db.prepare('DELETE FROM favorite_indices WHERE market=? AND symbol=?').run(market,symbol); return this.getFavorites(); }

  saveValuation(value: IndexValuation): void {
    this.db.prepare(`INSERT INTO index_valuations (market,symbol,name,pe_total_shares,pe_calculated_shares,valuation_date,available,unavailable_reason,fetched_at,source)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(market,symbol) DO UPDATE SET name=excluded.name,pe_total_shares=excluded.pe_total_shares,pe_calculated_shares=excluded.pe_calculated_shares,valuation_date=excluded.valuation_date,available=excluded.available,unavailable_reason=excluded.unavailable_reason,fetched_at=excluded.fetched_at,source=excluded.source`)
      .run(value.market,value.symbol,value.name,value.peTotalShares,value.peCalculatedShares,value.valuationDate,value.available?1:0,value.unavailableReason,value.fetchedAt,value.source);
  }
  getValuation(market:IndexMarket,symbol:string):IndexValuation|null {
    const r=this.db.prepare('SELECT * FROM index_valuations WHERE market=? AND symbol=?').get(market,symbol); if(!r)return null;
    return {market:r.market,symbol:r.symbol,name:r.name,peTotalShares:r.pe_total_shares,peCalculatedShares:r.pe_calculated_shares,valuationDate:r.valuation_date,available:Boolean(r.available),unavailableReason:r.unavailable_reason,fetchedAt:r.fetched_at,source:r.source};
  }

  private setRefresh(key:string):void { this.db.prepare("INSERT INTO index_refresh_state VALUES (?,datetime('now')) ON CONFLICT(cache_key) DO UPDATE SET refreshed_at=datetime('now')").run(key); }
  private toQuote(r:any):IndexQuote { return {market:r.market,symbol:r.symbol,key:`${r.market}:${r.symbol}`,displaySymbol:r.display_symbol,name:r.name,category:r.category,latestPrice:r.latest_price,changeAmount:r.change_amount,changePercent:r.change_percent,volume:r.volume,amount:r.amount,open:r.open_price,high:r.high_price,low:r.low_price,previousClose:r.previous_close,quoteUpdatedAt:r.quote_updated_at,source:r.source}; }
  private initializeSchema():void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS indices (market TEXT NOT NULL,symbol TEXT NOT NULL,display_symbol TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,latest_price REAL,change_amount REAL,change_percent REAL,volume REAL,amount REAL,open_price REAL,high_price REAL,low_price REAL,previous_close REAL,quote_updated_at TEXT,source TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(market,symbol));
    CREATE TABLE IF NOT EXISTS index_daily_prices (market TEXT NOT NULL,symbol TEXT NOT NULL,trade_date TEXT NOT NULL,open_price REAL,close_price REAL,high_price REAL,low_price REAL,volume REAL,amount REAL,change_percent REAL,change_amount REAL,source TEXT NOT NULL,fetched_at TEXT NOT NULL,PRIMARY KEY(market,symbol,trade_date));
    CREATE TABLE IF NOT EXISTS index_refresh_state (cache_key TEXT PRIMARY KEY,refreshed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS favorite_indices (market TEXT NOT NULL,symbol TEXT NOT NULL,favorited_at TEXT NOT NULL,PRIMARY KEY(market,symbol));
    CREATE TABLE IF NOT EXISTS index_valuations (market TEXT NOT NULL,symbol TEXT NOT NULL,name TEXT NOT NULL,pe_total_shares REAL,pe_calculated_shares REAL,valuation_date TEXT,available INTEGER NOT NULL,unavailable_reason TEXT,fetched_at TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(market,symbol));`);
    const seed=this.db.prepare("INSERT OR IGNORE INTO indices (market,symbol,display_symbol,name,category,source,updated_at) VALUES (?,?,?,?,?,'catalog',datetime('now'))");
    for(const item of INDEX_CATALOG) seed.run(item.market,item.symbol,item.displaySymbol,item.name,item.category);
  }
  private resolveDbPath():string { const candidates=[process.env.FINANCE_DB_PATH,resolve(process.cwd(),'data','finance.sqlite'),resolve(process.cwd(),'..','..','data','finance.sqlite')].filter(Boolean) as string[]; return candidates.find(p=>existsSync(p)) ?? candidates[0]; }
}
