import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SqliteRepository } from './sqlite.repository';
import type { Market } from '../types';
import type { BusinessData, BusinessSyncStatus, HypothesisData, ResearchEntry, ResearchKind, TrackingState } from '../research-tracking.types';
import { sameObservation } from '../research-tracking.types';
import type { ReviewInputDto } from '../research-tracking.dto';

export class ResearchTrackingRepository extends SqliteRepository {
  list(market: Market, symbol: string): TrackingState {
    const rows = this.db.prepare('SELECT * FROM company_research_entries WHERE market=? AND symbol=? ORDER BY updated_at DESC, id').all(market, symbol);
    const entries = (kind: ResearchKind) => rows.filter((r: any) => r.kind === kind).map((r: any) => this.decode(r));
    return { business: entries('business'), hypotheses: entries('hypotheses') };
  }
  private decode(row: any): ResearchEntry<any> { return { id: row.id ?? row.entry_id, version: row.version, updatedAt: row.updated_at, data: JSON.parse(row.payload_json) }; }
  private current(market: Market, symbol: string, kind: ResearchKind, id: string): ResearchEntry<any> {
    const row = this.db.prepare('SELECT * FROM company_research_entries WHERE id=? AND market=? AND symbol=? AND kind=?').get(id, market, symbol, kind);
    if (!row) throw new NotFoundException('记录不存在或不属于当前公司');
    return this.decode(row);
  }
  history(market: Market, symbol: string, kind: ResearchKind, id: string): ResearchEntry<any>[] {
    this.current(market, symbol, kind, id);
    return this.db.prepare('SELECT * FROM company_research_revisions WHERE entry_id=? ORDER BY version DESC').all(id).map((r: any) => this.decode(r));
  }
  save(market: Market, symbol: string, kind: ResearchKind, id: string | null, expectedVersion: number, data: BusinessData | HypothesisData): ResearchEntry<any> {
    return this.withTransaction(() => {
      const previous = id ? this.current(market, symbol, kind, id) : null;
      if ((previous?.version ?? 0) !== expectedVersion) throw new ConflictException('记录已在其他页面更新，请重新载入后再保存');
      // Source provenance is server-owned. A user edit protects this record from future sync.
      if (kind === 'business') {
        const { origin: ignored, ...manual } = data as BusinessData;
        data = { ...manual, ...(previous?.data.origin ? { origin: { ...previous.data.origin, managed: false } } : {}) };
      }
      if (kind === 'business' && !data.archived) {
        const duplicate = this.list(market, symbol).business.find(e => e.id !== id && !e.data.archived && sameObservation(e.data, data));
        if (duplicate) throw new ConflictException('该期间已有相同业务、指标与口径的数据，请编辑原记录');
      }
      if (kind === 'hypotheses') {
        const hypothesis = data as HypothesisData;
        if (hypothesis.valuationSnapshotId !== null && !this.db.prepare('SELECT id FROM company_valuation_models WHERE id=? AND market=? AND symbol=?').get(hypothesis.valuationSnapshotId, market, symbol)) throw new BadRequestException('关联估值快照不属于当前公司');
        // Edits to the hypothesis require renewed verification; older review is retained in history.
        data = { ...hypothesis, review: undefined };
      }
      return this.write(market, symbol, kind, id ?? randomUUID(), expectedVersion + 1, data);
    });
  }
  review(market: Market, symbol: string, id: string, input: ReviewInputDto): ResearchEntry<HypothesisData> {
    return this.withTransaction(() => {
      const entry = this.current(market, symbol, 'hypotheses', id) as ResearchEntry<HypothesisData>;
      if (entry.version !== input.expectedVersion) throw new ConflictException('研究假设已更新，请重新载入');
      if (entry.data.archived) throw new BadRequestException('已归档假设不能验证');
      const actual = this.list(market, symbol).business.find(e => !e.data.archived && !e.data.origin?.missing && sameObservation(e.data, entry.data));
      if (!actual) throw new BadRequestException('尚无相同期间、单位与口径的经营数据');
      if (actual.id !== input.businessId || actual.version !== input.businessVersion) throw new ConflictException('实际经营数据已修订，请重新载入后核对');
      const note = input.note.trim(), valuationImpact = input.valuationImpact.trim();
      if (!note || !valuationImpact) throw new BadRequestException('请填写验证结论与估值影响');
      const { expectedMin: min, expectedMax: max } = entry.data;
      const outcome = (min === null || actual.data.value >= min) && (max === null || actual.data.value <= max) ? 'met' : 'missed';
      return this.write(market, symbol, 'hypotheses', id, entry.version + 1, { ...entry.data, review: {
        businessId: actual.id, businessVersion: actual.version, actual: actual.data.value, outcome,
        reviewedAt: new Date().toISOString(), note, valuationImpact
      } });
    });
  }
  getSyncStatus(market: Market, symbol: string): BusinessSyncStatus | null {
    const row = this.db.prepare('SELECT payload_json FROM company_business_sync WHERE market=? AND symbol=?').get(market, symbol);
    return row ? JSON.parse(row.payload_json) : null;
  }
  setSyncStatus(market: Market, symbol: string, status: BusinessSyncStatus) {
    this.db.prepare('INSERT INTO company_business_sync VALUES (?,?,?) ON CONFLICT(market,symbol) DO UPDATE SET payload_json=excluded.payload_json').run(market, symbol, JSON.stringify(status));
  }
  importBusiness(market: Market, symbol: string, observations: BusinessData[], status: BusinessSyncStatus) {
    return this.withTransaction(() => {
      const entries = this.list(market, symbol).business;
      const seen = new Set(observations.map(d => d.origin!.key));
      for (const data of observations) {
        const previous = entries.find(e => e.data.origin?.provider === data.origin!.provider && e.data.origin?.key === data.origin!.key);
        const collision = entries.find(e => e.id !== previous?.id && !e.data.archived && sameObservation(e.data, data));
        if (collision || previous && (previous.data.archived || !previous.data.origin?.managed)) { status.protected++; continue; }
        if (previous) {
          const comparable = (d: BusinessData) => JSON.stringify({ ...d, origin: { ...d.origin, fetchedAt: '' } });
          if (comparable(previous.data) === comparable(data)) continue;
          this.write(market, symbol, 'business', previous.id, previous.version + 1, data);
          status.updated++;
        } else {
          const saved = this.write(market, symbol, 'business', randomUUID(), 1, data);
          entries.push(saved); status.added++;
        }
      }
      // A missing source observation is retained for audit, but cannot verify a hypothesis.
      // An empty response is not sufficient evidence that all previous disclosures vanished.
      if (observations.length) for (const entry of entries) {
        const origin = entry.data.origin;
        if (origin?.provider !== 'eastmoney-zygc' || !origin.managed || entry.data.archived || seen.has(origin.key)) continue;
        status.missing++;
        if (!origin.missing) this.write(market, symbol, 'business', entry.id, entry.version + 1, { ...entry.data, origin: { ...origin, missing: true } });
      }
      this.setSyncStatus(market, symbol, status);
      return status;
    });
  }
  private write(market: Market, symbol: string, kind: ResearchKind, id: string, version: number, data: BusinessData | HypothesisData): ResearchEntry<any> {
    const updatedAt = new Date().toISOString(), json = JSON.stringify(data);
    this.db.prepare(`INSERT INTO company_research_entries (id,market,symbol,kind,version,updated_at,payload_json) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at,payload_json=excluded.payload_json`).run(id, market, symbol, kind, version, updatedAt, json);
    this.db.prepare('INSERT INTO company_research_revisions (entry_id,version,updated_at,payload_json) VALUES (?,?,?,?)').run(id, version, updatedAt, json);
    return { id, version, updatedAt, data };
  }
}
