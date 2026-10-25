import type { CompanySearchResult, MarketFilter } from '../types/finance';

export async function progressiveSearch(
  market: MarketFilter,
  fetchSource: (source: string) => Promise<CompanySearchResult[]>,
  onResults: (results: CompanySearchResult[]) => void,
  signal?: AbortSignal
): Promise<CompanySearchResult[]> {
  const sources = ['local', ...(market === 'hk' ? [] : ['sz', 'sh', 'star', 'bj']), ...(market === 'a' ? [] : ['hk'])];
  const results = new Map<string, CompanySearchResult>();
  let remoteSuccess = false;
  let failed = false;
  await Promise.all(sources.map(async (source) => {
    try {
      const batch = await fetchSource(source);
      if (signal?.aborted) return;
      if (source !== 'local') remoteSuccess = true;
      for (const company of batch) results.set(`${company.market}:${company.symbol}`, company);
      onResults([...results.values()]);
    } catch {
      failed = true;
    }
  }));
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
  if (!results.size && failed) {
    throw new Error(remoteSuccess ? '部分数据源暂不可用，已返回的数据中未找到匹配股票，请稍后重试' : '搜索数据源暂不可用，请稍后重试');
  }
  return [...results.values()];
}
