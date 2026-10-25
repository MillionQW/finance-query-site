import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SqliteRepository } from './sqlite.repository';
import { calculatePerformance } from '../performance-calculation';
import { cleanPerformance, shanghaiDateTime, validatePerformanceTimeline } from '../performance.validation';
import type { PerformanceState } from '../performance.types';

export class PerformanceRepository extends SqliteRepository {
  constructor(db: any) {
    super(db);
    db.exec(`CREATE TABLE IF NOT EXISTS portfolio_performance (id INTEGER PRIMARY KEY CHECK(id=1), payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS portfolio_performance_history (version INTEGER PRIMARY KEY, saved_at TEXT NOT NULL, payload_json TEXT NOT NULL);`);
    db.prepare('INSERT OR IGNORE INTO portfolio_performance VALUES (1,?)').run(JSON.stringify({ startDate: shanghaiDateTime().slice(0, 10), version: 0, entries: [] }));
  }
  private state(): PerformanceState { return JSON.parse(this.db.prepare('SELECT payload_json FROM portfolio_performance WHERE id=1').get().payload_json); }
  get() { const state = this.state(); return { ...state, result: calculatePerformance(state.entries) }; }
  save(id: string | null, body: unknown) {
    return this.withTransaction(() => {
      const state = this.state();
      const { input, version } = cleanPerformance(body, state.startDate);
      if (version !== state.version) throw new ConflictException('收益记录已在其他页面变化，请重新载入后编辑');
      if (id && !state.entries.some(e => e.id === id)) throw new NotFoundException('收益记录不存在');
      if (id && state.entries.find(e => e.id === id)!.kind !== input.kind) throw new ConflictException('编辑时不能改变记录类型');
      const entry = { ...input, id: id ?? randomUUID(), updatedAt: new Date().toISOString() };
      state.entries = id ? state.entries.map(e => e.id === id ? entry : e) : [...state.entries, entry];
      validatePerformanceTimeline(state.entries, state.startDate);
      this.write(state);
      return this.get();
    });
  }
  remove(id: string, version: number) {
    return this.withTransaction(() => {
      const state = this.state();
      if (state.version !== version) throw new ConflictException('收益记录已变化，请重新载入后删除');
      if (!state.entries.some(e => e.id === id)) throw new NotFoundException('收益记录不存在');
      state.entries = state.entries.filter(e => e.id !== id);
      validatePerformanceTimeline(state.entries, state.startDate);
      this.write(state);
      return this.get();
    });
  }
  private write(state: PerformanceState) {
    state.version++;
    const json = JSON.stringify(state);
    this.db.prepare('UPDATE portfolio_performance SET payload_json=? WHERE id=1').run(json);
    this.db.prepare('INSERT INTO portfolio_performance_history VALUES (?,?,?)').run(state.version, new Date().toISOString(), json);
  }
}
