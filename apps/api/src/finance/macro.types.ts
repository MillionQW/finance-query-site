export const MACRO_INDICATORS = [
  { id: 'pmi', name: '官方制造业 PMI', shortName: '制造业 PMI', frequency: 'monthly', unit: '点', benchmark: 50 },
  { id: 'pmi-orders', name: '制造业 PMI 新订单', shortName: '新订单', frequency: 'monthly', unit: '点', benchmark: 50 },
  { id: 'cpi', name: '居民消费价格指数同比', shortName: 'CPI 同比', frequency: 'monthly', unit: '%', benchmark: 0 },
  { id: 'ppi', name: '工业生产者出厂价格指数同比', shortName: 'PPI 同比', frequency: 'monthly', unit: '%', benchmark: 0 },
  { id: 'retail', name: '社会消费品零售总额同比', shortName: '社零同比', frequency: 'monthly', unit: '%', benchmark: 0 },
  { id: 'credit', name: '社会融资规模增量', shortName: '社融增量', frequency: 'monthly', unit: '亿元', benchmark: null },
  { id: 'credit-stock-yoy', name: '社会融资规模存量同比', shortName: '社融存量同比', frequency: 'monthly', unit: '%', benchmark: null },
  { id: 'cn10y', name: '中国 10 年期国债收益率', shortName: '中国 10 年期国债', frequency: 'daily', unit: '%', benchmark: null },
  { id: 'us10y', name: '美国 10 年期国债收益率', shortName: '美国 10 年期国债', frequency: 'daily', unit: '%', benchmark: null },
  { id: 'usdcny', name: '美元兑人民币中间价', shortName: '美元兑人民币', frequency: 'daily', unit: '人民币/美元', benchmark: null }
] as const;

export type MacroId = typeof MACRO_INDICATORS[number]['id'];
export type MacroJob = MacroId | 'releases';

export interface MacroValue {
  period: string;
  periodLabel: string | null;
  value: number;
  releasedOn: string | null;
  source: string;
  sourceUrl: string;
  releaseUrl?: string | null;
}

export interface MacroRelease {
  id: MacroId;
  period: string;
  releasedOn: string;
  releaseUrl: string;
}

export interface MacroPoint extends MacroValue {
  releaseUrl: string | null;
}

export interface MacroSyncState {
  attemptedAt: string;
  syncedAt: string | null;
  failed: number;
}
