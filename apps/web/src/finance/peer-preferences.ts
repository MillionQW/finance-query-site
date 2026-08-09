import type { CacheEntry, CompanySearchResult, PeerComparison } from '../types/finance';

const BASKET_STORAGE_KEY = 'finance-peer-basket:v1';
const SNAPSHOT_STORAGE_PREFIX = 'finance-peer-snapshot:v1:';

export interface StoredPeerSnapshot {
  version: 1;
  fetchedAt: string;
  industryName: string | null;
  peers: Array<{ key: string; name: string }>;
  rankings: Array<{ key: string; label: string; rank: number | null; total: number }>;
}

export interface PeerChangeSummary {
  title: string;
  detail: string;
  tone: 'info' | 'warning';
}

export function peerPreferenceStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function peerCompanyKey(company: Pick<CompanySearchResult, 'market' | 'symbol'>): string {
  return `${company.market}:${company.symbol}`;
}

export function sanitizePeerBasketKeys(
  keys: string[],
  entries: CacheEntry[],
  requiredKey?: string,
  max = 8
): string[] {
  const available = new Set(entries
    .filter((entry) => entry.kind === 'statements')
    .map(peerCompanyKey));
  const result: string[] = [];
  if (requiredKey && available.has(requiredKey)) result.push(requiredKey);
  for (const key of keys) {
    if (!available.has(key) || result.includes(key) || result.length >= max) continue;
    result.push(key);
  }
  return result;
}

export function loadPeerBasket(storage: Storage | null): string[] {
  if (!storage) return [];
  try {
    const value = safeParse<unknown>(storage.getItem(BASKET_STORAGE_KEY));
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function savePeerBasket(storage: Storage | null, keys: string[]): void {
  if (!storage) return;
  try {
    storage.setItem(BASKET_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Device-local preferences are optional; storage restrictions must not break comparison.
  }
}

export function buildPeerSnapshot(comparison: PeerComparison): StoredPeerSnapshot {
  return {
    version: 1,
    fetchedAt: comparison.fetchedAt,
    industryName: comparison.industry?.name ?? null,
    peers: comparison.peers.map((peer) => ({ key: peerCompanyKey(peer), name: peer.name })),
    rankings: comparison.rankings.map((ranking) => ({
      key: ranking.key,
      label: ranking.label,
      rank: ranking.rank,
      total: ranking.total
    }))
  };
}

export function comparePeerSnapshots(
  previous: StoredPeerSnapshot | null,
  current: StoredPeerSnapshot
): PeerChangeSummary | null {
  if (!previous || previous.fetchedAt === current.fetchedAt) return null;
  if (previous.industryName && current.industryName && previous.industryName !== current.industryName) {
    return {
      title: '所属行业口径发生变化',
      detail: `${previous.industryName} → ${current.industryName}，历史排名不再直接可比。`,
      tone: 'warning'
    };
  }

  const previousPeers = new Map(previous.peers.map((peer) => [peer.key, peer.name]));
  const currentPeerKeys = new Set(current.peers.map((peer) => peer.key));
  const added = current.peers.filter((peer) => !previousPeers.has(peer.key));
  const removed = previous.peers.filter((peer) => !currentPeerKeys.has(peer.key));
  const detailParts: string[] = [];
  if (added.length) detailParts.push(`新增 ${added.slice(0, 3).map((peer) => peer.name).join('、')}${added.length > 3 ? ` 等 ${added.length} 家` : ''}`);
  if (removed.length) detailParts.push(`移出 ${removed.slice(0, 3).map((peer) => peer.name).join('、')}${removed.length > 3 ? ` 等 ${removed.length} 家` : ''}`);

  const previousRankings = new Map(previous.rankings.map((ranking) => [ranking.key, ranking]));
  const rankChanges = current.rankings
    .map((ranking) => {
      const prior = previousRankings.get(ranking.key);
      if (!prior?.rank || !ranking.rank) return null;
      const delta = prior.rank - ranking.rank;
      if (Math.abs(delta) < 2) return null;
      return `${ranking.label}${delta > 0 ? '上升' : '下降'} ${Math.abs(delta)} 位`;
    })
    .filter((item): item is string => Boolean(item));
  if (rankChanges.length) detailParts.push(rankChanges.slice(0, 2).join('、'));

  if (!detailParts.length) return null;
  return {
    title: added.length || removed.length ? '同行样本较上次有变化' : '行业位置较上次有变化',
    detail: detailParts.join('；'),
    tone: removed.length > 0 ? 'warning' : 'info'
  };
}

export function peerSnapshotStorageKey(company: Pick<CompanySearchResult, 'market' | 'symbol'>): string {
  return `${SNAPSHOT_STORAGE_PREFIX}${peerCompanyKey(company)}`;
}

export function loadPeerSnapshot(
  storage: Storage | null,
  company: Pick<CompanySearchResult, 'market' | 'symbol'>
): StoredPeerSnapshot | null {
  if (!storage) return null;
  try {
    const value = safeParse<StoredPeerSnapshot>(storage.getItem(peerSnapshotStorageKey(company)));
    return value?.version === 1 ? value : null;
  } catch {
    return null;
  }
}

export function savePeerSnapshot(
  storage: Storage | null,
  company: Pick<CompanySearchResult, 'market' | 'symbol'>,
  snapshot: StoredPeerSnapshot
): void {
  if (!storage) return;
  try {
    storage.setItem(peerSnapshotStorageKey(company), JSON.stringify(snapshot));
  } catch {
    // Snapshot reminders are optional device-local enhancements.
  }
}
