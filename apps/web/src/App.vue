<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Database,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Star,
  StickyNote,
  TrendingUp,
  X
} from 'lucide-vue-next';
import CustomMetricChart from './components/CustomMetricChart.vue';
import AnnouncementPanel from './components/AnnouncementPanel.vue';
import CacheManagerPanel from './components/CacheManagerPanel.vue';
import MiniTrend from './components/MiniTrend.vue';
import PeerComparisonPanel from './components/PeerComparisonPanel.vue';
import PeerMetricChart from './components/PeerMetricChart.vue';
import StatementTable from './components/StatementTable.vue';
import EtfPage from './components/EtfPage.vue';
import IndexPage from './components/IndexPage.vue';
import {
  getCacheEntries,
  getAnnouncements,
  getCompanyInsight,
  getFavorites,
  getMetricComparison,
  getPeerComparison,
  getPeerMetricComparison,
  getRefreshStatus,
  getStatements,
  markAnnouncementsViewed,
  removeFavorite,
  saveFavorite,
  saveCompanyInsight,
  searchCompanies,
  triggerRefresh
} from './services/api';
import type {
  CompanySearchResult,
  CompanyInsight,
  AnnouncementFeed,
  CacheEntry,
  FavoriteCompany,
  FinancialStatements,
  Market,
  MarketFilter,
  PeerComparison,
  PeerMetricComparison,
  StatementRefreshRuntimeStatus,
  StatementType
} from './types/finance';

const seedCompanies: CompanySearchResult[] = [
  { market: 'hk', symbol: '00700', displaySymbol: '00700.HK', name: '腾讯控股', source: 'seed' },
  { market: 'a', symbol: '600519', displaySymbol: '600519.SH', name: '贵州茅台', source: 'seed' },
  { market: 'hk', symbol: '09988', displaySymbol: '09988.HK', name: '阿里巴巴-W', source: 'seed' },
  { market: 'a', symbol: '601398', displaySymbol: '601398.SH', name: '工商银行', source: 'seed' },
  { market: 'hk', symbol: '03690', displaySymbol: '03690.HK', name: '美团-W', source: 'seed' }
];

type UrlMode = 'push' | 'replace' | 'none';
type AppView = 'company' | 'settings' | 'etf' | 'index';
const initialCompany = companyFromUrl() ?? seedCompanies[0];
const currentView = ref<AppView>(viewFromUrl());
const query = ref(initialCompany.name);
const market = ref<MarketFilter>(initialCompany.market);
const companies = ref<CompanySearchResult[]>(mergeCompanyList([initialCompany], seedCompanies));
const selectedCompany = ref<CompanySearchResult | null>(initialCompany);
const statements = ref<FinancialStatements | null>(null);
const peerComparison = ref<PeerComparison | null>(null);
const peerMetricComparison = ref<PeerMetricComparison | null>(null);
const announcementFeed = ref<AnnouncementFeed | null>(null);
const activeStatement = ref<StatementType>('balance');
const activePeerMetricKey = ref('revenue');
const peerMetricMode = ref<'peers' | 'custom'>('peers');
const selectedMetricCompanyKeys = ref<string[]>([]);
const selectedYears = ref<string[]>([]);
const searchLoading = ref(false);
const statementLoading = ref(false);
const peerLoading = ref(false);
const peerMetricLoading = ref(false);
const cacheEntriesLoading = ref(false);
const announcementLoading = ref(false);
const searchError = ref<string | null>(null);
const statementError = ref<string | null>(null);
const peerError = ref<string | null>(null);
const peerMetricError = ref<string | null>(null);
const cacheEntriesError = ref<string | null>(null);
const announcementError = ref<string | null>(null);
const searchDropdownOpen = ref(false);
const favorites = ref<FavoriteCompany[]>([]);
const recentCompanies = ref<CompanySearchResult[]>([]);
const favoriteLoading = ref(false);
const favoriteNotice = ref<string | null>(null);
const refreshStatus = ref<StatementRefreshRuntimeStatus | null>(null);
const cacheEntries = ref<CacheEntry[]>([]);
const refreshTaskLoading = ref(false);
const refreshTaskNotice = ref<string | null>(null);
const companyInsights = ref<Record<string, CompanyInsight>>({});
const noteDialogOpen = ref(false);
const noteDraft = ref('');
const buyPointDraft = ref('');
const buyPointEditing = ref(false);
let searchTimer: number | undefined;
let favoriteNoticeTimer: number | undefined;
let peerRequestId = 0;
let peerMetricRequestId = 0;
let announcementRequestId = 0;
let insightRequestId = 0;

const marketOptions: { value: MarketFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'a', label: 'A股' },
  { value: 'hk', label: '港股' }
];

const activeTable = computed(() =>
  statements.value?.tables.find((table) => table.type === activeStatement.value)
);

const availableYears = computed(() => statements.value?.years ?? []);

const activeYears = computed(() => {
  const chosen = selectedYears.value.length ? selectedYears.value : availableYears.value;
  return chosen;
});

const selectedIsFavorite = computed(() => {
  if (!selectedCompany.value) return false;
  return favorites.value.some((company) => companyKey(company) === companyKey(selectedCompany.value!));
});

const visibleRecentCompanies = computed(() =>
  recentCompanies.value.filter((company) => !sameCompany(company, selectedCompany.value)).slice(0, 8)
);

const activeCompanyInsight = computed<CompanyInsight>(() => {
  if (!selectedCompany.value) {
    return { market: 'a', symbol: '', note: '', buyPointRange: '', buyPointUpdatedAt: null, updatedAt: null };
  }
  return companyInsights.value[companyKey(selectedCompany.value)] ?? {
    market: selectedCompany.value.market,
    symbol: selectedCompany.value.symbol,
    note: '',
    buyPointRange: '',
    buyPointUpdatedAt: null,
    updatedAt: null
  };
});

const showBuyPointReminder = computed(() => {
  const updatedAt = activeCompanyInsight.value.buyPointUpdatedAt;
  if (!updatedAt || !activeCompanyInsight.value.buyPointRange) return false;
  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) return false;
  const reminderDate = new Date(updatedDate.getFullYear() + 1, 5, 1);
  return new Date() >= reminderDate;
});

const showSearchDropdown = computed(() => {
  return (
    searchDropdownOpen.value &&
    (searchLoading.value || Boolean(searchError.value) || query.value.trim().length > 0 || companies.value.length > 0)
  );
});

const summaryCards = computed(() => {
  return (statements.value?.highlights ?? []).slice(0, 4).map((series) => {
    const values = series.points.map((point) => point.value).filter((value): value is number => value !== null);
    const latest = values[values.length - 1] ?? null;
    const previous = values[values.length - 2] ?? null;
    const delta = latest !== null && previous ? ((latest - previous) / Math.abs(previous)) * 100 : null;
    return { ...series, latest, delta };
  });
});

const statementCacheLabel = computed(() => {
  if (!statements.value?.cache) {
    return '加载中';
  }
  return statements.value.cache.hit ? '本地缓存' : '刚刚更新';
});

const selectedMetricCompanies = computed(() => {
  const selected = new Set(selectedMetricCompanyKeys.value);
  return cacheEntries.value
    .filter((entry) => entry.kind === 'statements' && selected.has(companyKey(entry)))
    .map((entry) => ({
      market: entry.market,
      symbol: entry.symbol,
      name: entry.name ?? entry.displaySymbol
    }));
});

function marketLabel(value?: MarketFilter): string {
  if (value === 'hk') return '港股';
  if (value === 'a') return 'A股';
  return '全部市场';
}

function formatNumber(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  }
  if (abs >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}亿`;
  }
  if (abs >= 10_000) {
    return `${(value / 10_000).toFixed(2)}万`;
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function refreshRunLabel(status?: string): string {
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'skipped') return '已跳过';
  if (status === 'running') return '运行中';
  return '-';
}

function companyKey(company: Pick<CompanySearchResult, 'market' | 'symbol'>): string {
  return `${company.market}:${company.symbol}`;
}

function openNoteDialog(): void {
  if (!selectedCompany.value) return;
  noteDraft.value = activeCompanyInsight.value.note;
  noteDialogOpen.value = true;
}

function closeNoteDialog(): void {
  noteDialogOpen.value = false;
}

function startBuyPointEditing(): void {
  buyPointDraft.value = activeCompanyInsight.value.buyPointRange;
  buyPointEditing.value = true;
}

function cancelBuyPointEditing(): void {
  buyPointDraft.value = activeCompanyInsight.value.buyPointRange;
  buyPointEditing.value = false;
}

async function loadCompanyInsight(company: CompanySearchResult): Promise<void> {
  const requestId = ++insightRequestId;
  try {
    const insight = await getCompanyInsight(company.market, company.symbol);
    companyInsights.value = { ...companyInsights.value, [companyKey(company)]: insight };
    if (requestId === insightRequestId && sameCompany(company, selectedCompany.value)) {
      buyPointDraft.value = insight.buyPointRange;
    }
  } catch (error) {
    if (requestId === insightRequestId) {
      statementError.value = error instanceof Error ? error.message : '公司备注读取失败';
    }
  }
}

async function persistActiveCompanyInsight(input: { note: string; buyPointRange: string }): Promise<CompanyInsight | null> {
  if (!selectedCompany.value) return null;
  const company = selectedCompany.value;
  try {
    const insight = await saveCompanyInsight(company.market, company.symbol, input);
    companyInsights.value = { ...companyInsights.value, [companyKey(company)]: insight };
    return insight;
  } catch (error) {
    statementError.value = error instanceof Error ? error.message : '公司备注保存失败';
    return null;
  }
}

async function saveNote(): Promise<void> {
  const saved = await persistActiveCompanyInsight({
    note: noteDraft.value.trim(),
    buyPointRange: activeCompanyInsight.value.buyPointRange
  });
  if (saved) closeNoteDialog();
}

async function saveBuyPoint(): Promise<void> {
  if (!selectedCompany.value) return;
  const nextValue = buyPointDraft.value.trim();
  const current = activeCompanyInsight.value;
  if (nextValue === current.buyPointRange) {
    buyPointEditing.value = false;
    return;
  }
  const saved = await persistActiveCompanyInsight({ note: current.note, buyPointRange: nextValue });
  if (saved) {
    buyPointDraft.value = saved.buyPointRange;
    buyPointEditing.value = false;
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && noteDialogOpen.value) closeNoteDialog();
}

function sameCompany(
  left: Pick<CompanySearchResult, 'market' | 'symbol'> | null,
  right: Pick<CompanySearchResult, 'market' | 'symbol'> | null
): boolean {
  return Boolean(left && right && left.market === right.market && left.symbol === right.symbol);
}

function normalizeUrlSymbol(value: string, selectedMarket: Market): string {
  const digits = value.replace(/\D/g, '');
  if (selectedMarket === 'hk') {
    return digits.padStart(5, '0');
  }
  return digits;
}

function displaySymbolFor(selectedMarket: Market, symbol: string): string {
  if (selectedMarket === 'hk') {
    return `${symbol}.HK`;
  }
  if (symbol.startsWith('6')) {
    return `${symbol}.SH`;
  }
  if (symbol.startsWith('4') || symbol.startsWith('8') || symbol.startsWith('9')) {
    return `${symbol}.BJ`;
  }
  return `${symbol}.SZ`;
}

function companyFromUrl(): CompanySearchResult | null {
  const params = new URLSearchParams(window.location.search);
  const urlMarket = params.get('market');
  const rawSymbol = params.get('symbol') ?? params.get('code') ?? '';
  if (urlMarket !== 'a' && urlMarket !== 'hk') {
    return null;
  }

  const symbol = normalizeUrlSymbol(rawSymbol, urlMarket);
  if (!symbol) {
    return null;
  }

  const seeded = seedCompanies.find(
    (company) => company.market === urlMarket && company.symbol === symbol
  );
  if (seeded) {
    return seeded;
  }

  const displaySymbol = displaySymbolFor(urlMarket, symbol);
  return {
    market: urlMarket,
    symbol,
    displaySymbol,
    name: displaySymbol,
    source: 'url'
  };
}

function viewFromUrl(): AppView {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'settings') return 'settings';
  if (view === 'etf') return 'etf';
  if (view === 'index') return 'index';
  return 'company';
}

function mergeCompanyList(
  additions: CompanySearchResult[],
  base: CompanySearchResult[]
): CompanySearchResult[] {
  const seen = new Set<string>();
  const merged: CompanySearchResult[] = [];
  for (const company of [...additions, ...base]) {
    const key = companyKey(company);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(company);
  }
  return merged;
}

function syncCompanyUrl(company: CompanySearchResult, mode: Exclude<UrlMode, 'none'>): void {
  const params = new URLSearchParams(window.location.search);
  const currentMarket = params.get('market');
  const currentSymbol = params.get('symbol') ?? '';
  const alreadySynced =
    currentMarket === company.market &&
    normalizeUrlSymbol(currentSymbol, company.market) === company.symbol;
  if (alreadySynced && mode === 'push') {
    return;
  }

  params.set('market', company.market);
  params.set('symbol', company.symbol);
  const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState'](
    { market: company.market, symbol: company.symbol },
    '',
    nextUrl
  );
}

function syncViewUrl(view: AppView, mode: 'push' | 'replace' = 'push'): void {
  const params = new URLSearchParams(window.location.search);
  if (view === 'settings') {
    params.set('view', 'settings');
  } else if (view === 'etf') {
    params.set('view', 'etf');
    if (!params.get('etf')) params.set('etf', '510300');
  } else if (view === 'index') {
    params.set('view', 'index');
    params.delete('etf');
    if (!params.get('index')) params.set('index', 'cn:000300');
  } else {
    params.delete('view');
    params.delete('etf');
    params.delete('index');
  }
  const queryString = params.toString();
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({ view }, '', nextUrl);
  currentView.value = view;
}

async function openSettingsPage(): Promise<void> {
  searchDropdownOpen.value = false;
  syncViewUrl('settings');
  window.scrollTo({ top: 0, behavior: 'auto' });
  await Promise.all([loadRefreshStatus(), loadCacheEntries()]);
}

async function openCompanyPage(): Promise<void> {
  syncViewUrl('company');
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (!statements.value && selectedCompany.value) {
    await runSearch();
    await selectCompany(selectedCompany.value, false, 'replace');
  }
}

function openEtfPage(): void {
  searchDropdownOpen.value = false;
  syncViewUrl('etf');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openIndexPage(): void {
  searchDropdownOpen.value = false;
  syncViewUrl('index');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function handleUrlNavigation(): void {
  currentView.value = viewFromUrl();
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (currentView.value === 'settings') {
    void Promise.all([loadRefreshStatus(), loadCacheEntries()]);
    return;
  }
  if (currentView.value === 'etf' || currentView.value === 'index') return;

  const company = companyFromUrl();
  if (!company) {
    return;
  }
  if (sameCompany(company, selectedCompany.value)) {
    if (!statements.value) {
      void selectCompany(company, false, 'none');
    }
    return;
  }

  market.value = company.market;
  query.value = company.name;
  companies.value = mergeCompanyList([company], companies.value);
  void selectCompany(company, false, 'none');
}

function normalizeFavorite(company: CompanySearchResult): CompanySearchResult {
  return {
    market: company.market,
    symbol: company.symbol,
    displaySymbol: company.displaySymbol,
    name: company.name,
    source: company.source,
    latestPrice: company.latestPrice ?? null,
    changePercent: company.changePercent ?? null
  };
}

function storageSafeCompany(company: CompanySearchResult): CompanySearchResult {
  return {
    market: company.market,
    symbol: company.symbol,
    displaySymbol: company.displaySymbol,
    name: company.name,
    source: company.source || 'recent',
    latestPrice: company.latestPrice ?? null,
    changePercent: company.changePercent ?? null
  };
}

function loadRecentCompanies(): void {
  try {
    const raw = window.localStorage.getItem('finance-query:recent-companies');
    const parsed = raw ? (JSON.parse(raw) as CompanySearchResult[]) : [];
    recentCompanies.value = mergeCompanyList(parsed.filter(Boolean), []).slice(0, 8);
  } catch {
    recentCompanies.value = [];
  }
}

function rememberRecentCompany(company: CompanySearchResult): void {
  const normalized = storageSafeCompany(company);
  recentCompanies.value = mergeCompanyList([normalized], recentCompanies.value).slice(0, 8);
  window.localStorage.setItem(
    'finance-query:recent-companies',
    JSON.stringify(recentCompanies.value)
  );
}

async function loadFavorites(): Promise<void> {
  try {
    favorites.value = await getFavorites();
  } catch (error) {
    favorites.value = [];
    showFavoriteNotice(error instanceof Error ? error.message : '收藏读取失败');
  }
}

async function loadRefreshStatus(): Promise<void> {
  try {
    refreshStatus.value = await getRefreshStatus();
  } catch (error) {
    refreshTaskNotice.value = error instanceof Error ? error.message : '更新任务状态读取失败';
  }
}

async function loadCacheEntries(): Promise<void> {
  cacheEntriesLoading.value = true;
  cacheEntriesError.value = null;
  try {
    cacheEntries.value = await getCacheEntries();
    if (!selectedMetricCompanyKeys.value.length && selectedCompany.value) {
      selectedMetricCompanyKeys.value = cacheEntries.value
        .filter((entry) => entry.kind === 'statements')
        .slice(0, 4)
        .map((entry) => companyKey(entry));
    }
  } catch (error) {
    cacheEntriesError.value = error instanceof Error ? error.message : '缓存列表读取失败';
  } finally {
    cacheEntriesLoading.value = false;
  }
}

async function runRefreshTask(): Promise<void> {
  if (refreshTaskLoading.value || refreshStatus.value?.running) return;

  refreshTaskLoading.value = true;
  refreshTaskNotice.value = null;
  try {
    const run = await triggerRefresh();
    refreshTaskNotice.value = run.message ?? '数据更新任务已完成';
    await loadRefreshStatus();
    await loadCacheEntries();
    if (selectedCompany.value && currentView.value === 'company') {
      await selectCompany(selectedCompany.value, false, 'replace');
    }
  } catch (error) {
    refreshTaskNotice.value = error instanceof Error ? error.message : '数据更新任务触发失败';
  } finally {
    refreshTaskLoading.value = false;
  }
}

function showFavoriteNotice(message: string): void {
  favoriteNotice.value = message;
  window.clearTimeout(favoriteNoticeTimer);
  favoriteNoticeTimer = window.setTimeout(() => {
    favoriteNotice.value = null;
  }, 1800);
}

function openSearchDropdown(): void {
  searchDropdownOpen.value = true;
}

function handleSearchFocusOut(event: FocusEvent): void {
  const current = event.currentTarget;
  const next = event.relatedTarget;
  if (current instanceof HTMLElement && next instanceof Node && current.contains(next)) {
    return;
  }
  searchDropdownOpen.value = false;
}

function submitSearch(): void {
  searchDropdownOpen.value = true;
  void runSearch();
}

function selectSearchCompany(company: CompanySearchResult): void {
  searchDropdownOpen.value = false;
  void selectCompany(company);
}

async function toggleFavorite(): Promise<void> {
  if (!selectedCompany.value || favoriteLoading.value) return;

  const current = normalizeFavorite(selectedCompany.value);
  const key = companyKey(current);
  const alreadySaved = favorites.value.some((company) => companyKey(company) === key);

  favoriteLoading.value = true;
  try {
    favorites.value = alreadySaved
      ? await removeFavorite(current.market, current.symbol)
      : await saveFavorite(current);

    showFavoriteNotice(alreadySaved ? `已取消收藏 ${current.name}` : `已收藏 ${current.name}`);
  } catch (error) {
    showFavoriteNotice(error instanceof Error ? error.message : '收藏保存失败');
  } finally {
    favoriteLoading.value = false;
  }
}

async function runSearch(): Promise<void> {
  const text = query.value.trim();
  if (!text) {
    companies.value = seedCompanies;
    searchError.value = null;
    return;
  }

  searchLoading.value = true;
  searchError.value = null;
  try {
    const results = await searchCompanies(text, market.value);
    companies.value = results;
    if (results.length && !selectedCompany.value) {
      await selectCompany(results[0]);
    }
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : '搜索失败';
    companies.value = seedCompanies.filter(
      (company) =>
        market.value === 'all' || company.market === market.value
    );
  } finally {
    searchLoading.value = false;
  }
}

async function selectCompany(company: CompanySearchResult, refresh = false, urlMode: UrlMode = 'push'): Promise<void> {
  companies.value = mergeCompanyList([company], companies.value);
  selectedCompany.value = company;
  rememberRecentCompany(company);
  if (urlMode !== 'none') {
    syncCompanyUrl(company, urlMode);
  }
  statementLoading.value = true;
  statementError.value = null;
  activeStatement.value = 'balance';
  void loadPeerComparison(company);
  void loadPeerMetricComparison(company);
  void loadAnnouncements(company);
  void loadCompanyInsight(company);
  try {
    statements.value = await getStatements(company.market, company.symbol, 0, refresh);
    if (sameCompany(company, selectedCompany.value) && statements.value.company.name) {
      const enrichedCompany = {
        ...company,
        displaySymbol: statements.value.company.displaySymbol || company.displaySymbol,
        name: statements.value.company.name
      };
      selectedCompany.value = enrichedCompany;
      companies.value = mergeCompanyList([enrichedCompany], companies.value);
      rememberRecentCompany(enrichedCompany);
    }
    selectedYears.value = [...statements.value.years];
  } catch (error) {
    statements.value = null;
    statementError.value = error instanceof Error ? error.message : '财报查询失败';
  } finally {
    statementLoading.value = false;
  }
}

async function loadAnnouncements(company: CompanySearchResult): Promise<void> {
  const requestId = ++announcementRequestId;
  announcementLoading.value = true;
  announcementError.value = null;
  announcementFeed.value = null;
  try {
    const feed = await getAnnouncements(company.market, company.symbol);
    if (requestId !== announcementRequestId) return;
    announcementFeed.value = feed;
    favorites.value = await markAnnouncementsViewed(company.market, company.symbol);
  } catch (error) {
    if (requestId === announcementRequestId) {
      announcementError.value = error instanceof Error ? error.message : '公告读取失败';
    }
  } finally {
    if (requestId === announcementRequestId) {
      announcementLoading.value = false;
    }
  }
}

async function loadPeerComparison(company: CompanySearchResult): Promise<void> {
  const requestId = ++peerRequestId;
  peerLoading.value = true;
  peerError.value = null;
  peerComparison.value = null;

  try {
    const payload = await getPeerComparison(company.market, company.symbol, 20);
    if (requestId === peerRequestId) {
      peerComparison.value = payload;
    }
  } catch (error) {
    if (requestId === peerRequestId) {
      peerError.value = error instanceof Error ? error.message : '同行对比获取失败';
    }
  } finally {
    if (requestId === peerRequestId) {
      peerLoading.value = false;
    }
  }
}

async function loadPeerMetricComparison(company: CompanySearchResult): Promise<void> {
  const requestId = ++peerMetricRequestId;
  peerMetricLoading.value = true;
  peerMetricError.value = null;

  try {
    if (peerMetricMode.value === 'custom' && !selectedMetricCompanies.value.length) {
      peerMetricComparison.value = {
        metricKey: activePeerMetricKey.value,
        metricLabel: '自选指标',
        years: [],
        companies: [],
        missingCompanies: []
      };
      return;
    }

    const payload = peerMetricMode.value === 'custom'
      ? await getMetricComparison(activePeerMetricKey.value, selectedMetricCompanies.value)
      : await getPeerMetricComparison(company.market, company.symbol, activePeerMetricKey.value, 12);
    if (requestId === peerMetricRequestId) {
      peerMetricComparison.value = payload;
    }
  } catch (error) {
    if (requestId === peerMetricRequestId) {
      peerMetricComparison.value = null;
      peerMetricError.value = error instanceof Error ? error.message : '同行财务指标读取失败';
    }
  } finally {
    if (requestId === peerMetricRequestId) {
      peerMetricLoading.value = false;
    }
  }
}

function changePeerMetric(value: string): void {
  activePeerMetricKey.value = value;
  if (selectedCompany.value) {
    void loadPeerMetricComparison(selectedCompany.value);
  }
}

function changePeerMetricMode(value: 'peers' | 'custom'): void {
  peerMetricMode.value = value;
  if (selectedCompany.value) {
    void loadPeerMetricComparison(selectedCompany.value);
  }
}

function changeMetricCompanies(value: string[]): void {
  selectedMetricCompanyKeys.value = value;
  if (selectedCompany.value && peerMetricMode.value === 'custom') {
    void loadPeerMetricComparison(selectedCompany.value);
  }
}

function toggleYear(year: string): void {
  if (selectedYears.value.includes(year)) {
    selectedYears.value = selectedYears.value.filter((item) => item !== year);
    return;
  }
  selectedYears.value = [...selectedYears.value, year].sort((a, b) => b.localeCompare(a));
}

function exportCsv(): void {
  if (!activeTable.value) return;
  const header = ['项目', ...activeYears.value];
  const lines = activeTable.value.rows.map((row) =>
    [row.item, ...activeYears.value.map((year) => row.values[year] ?? '')]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${selectedCompany.value?.displaySymbol ?? 'statements'}-${activeTable.value.type}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

watch([query, market], () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void runSearch();
  }, 380);
});

watch(selectedCompany, () => {
  buyPointDraft.value = activeCompanyInsight.value.buyPointRange;
  buyPointEditing.value = false;
  noteDialogOpen.value = false;
});

onMounted(async () => {
  window.addEventListener('popstate', handleUrlNavigation);
  window.addEventListener('keydown', handleGlobalKeydown);
  loadRecentCompanies();
  await Promise.all([loadRefreshStatus(), loadCacheEntries(), loadFavorites()]);
  if (currentView.value === 'company') {
    await runSearch();
    if (selectedCompany.value) {
      await selectCompany(selectedCompany.value, false, 'replace');
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('popstate', handleUrlNavigation);
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><Database :size="18" /></span>
        <strong>财报查询台</strong>
      </div>

      <div v-if="currentView === 'company'" class="search-shell" @focusin="openSearchDropdown" @focusout="handleSearchFocusOut">
        <div class="global-search">
          <Search :size="20" />
          <input
            v-model="query"
            type="search"
            placeholder="公司/代码，例如：腾讯、00700、600519"
            aria-label="搜索公司或股票代码"
            @keydown.enter.prevent="submitSearch"
          />
          <button type="button" :disabled="searchLoading" @click="submitSearch">
            <Loader2 v-if="searchLoading" class="spin-icon" :size="15" />
            <span>{{ searchLoading ? '搜索中' : '搜索' }}</span>
          </button>
        </div>

        <div v-if="showSearchDropdown" class="search-dropdown" role="listbox" aria-label="搜索结果">
          <div class="search-market-tabs" aria-label="市场筛选">
            <button
              v-for="item in marketOptions"
              :key="item.value"
              :class="{ active: market === item.value }"
              type="button"
              @click="market = item.value"
            >
              {{ item.label }}
            </button>
          </div>

          <div v-if="searchLoading" class="search-dropdown-state searching">
            <Loader2 class="spin-icon" :size="16" />
            <span>正在从 AKShare 搜索公司...</span>
          </div>
          <div v-else-if="searchError" class="search-dropdown-state error">
            {{ searchError }}
          </div>
          <div v-else-if="companies.length" class="search-results">
            <button
              v-for="company in companies"
              :key="`${company.market}-${company.symbol}`"
              class="search-result-row"
              :class="{ active: selectedCompany?.market === company.market && selectedCompany?.symbol === company.symbol }"
              type="button"
              role="option"
              :aria-selected="selectedCompany?.market === company.market && selectedCompany?.symbol === company.symbol"
              @click="selectSearchCompany(company)"
            >
              <span class="company-logo" :data-market="company.market">{{ company.name.slice(0, 1) }}</span>
              <span class="company-main">
                <strong>{{ company.name }}</strong>
                <span>
                  {{ company.displaySymbol }}
                  <small>{{ company.market === 'hk' ? 'HK' : 'A' }}</small>
                </span>
              </span>
              <span class="company-quote">
                <span v-if="company.latestPrice !== null && company.latestPrice !== undefined">
                  {{ company.latestPrice }}
                </span>
                <em
                  v-if="company.changePercent !== null && company.changePercent !== undefined"
                  :class="{ up: Number(company.changePercent) > 0, down: Number(company.changePercent) < 0 }"
                >
                  {{ Number(company.changePercent).toFixed(2) }}%
                </em>
              </span>
            </button>
          </div>
          <div v-else class="search-dropdown-state">
            暂无搜索结果
          </div>
        </div>
      </div>

      <div v-else-if="currentView === 'settings'" class="settings-topbar-title">
        <Settings :size="18" />
        <strong>系统设置</strong>
      </div>
      <div v-else-if="currentView === 'etf'" class="settings-topbar-title">
        <TrendingUp :size="18" />
        <strong>ETF 研究</strong>
      </div>
      <div v-else class="settings-topbar-title">
        <TrendingUp :size="18" />
        <strong>指数研究</strong>
      </div>

      <nav class="top-actions" aria-label="工具">
        <button v-if="currentView === 'company'" class="ghost-button" type="button" @click="openEtfPage">
          <TrendingUp :size="17" />ETF
        </button>
        <button v-if="currentView === 'company'" class="ghost-button" type="button" @click="openIndexPage">
          <TrendingUp :size="17" />指数
        </button>
        <button v-if="currentView === 'company'" class="ghost-button" type="button" title="刷新财报" @click="selectedCompany && selectCompany(selectedCompany, true)">
          <RefreshCw :size="17" />刷新
        </button>
        <button
          v-if="currentView === 'company'"
          class="ghost-button"
          :class="{ 'favorite-active': selectedIsFavorite }"
          type="button"
          :title="favoriteLoading ? '保存中' : selectedIsFavorite ? '取消收藏' : '收藏'"
          :disabled="!selectedCompany || favoriteLoading"
          @click="toggleFavorite"
        >
          <Star :size="17" />{{ favoriteLoading ? '保存中' : selectedIsFavorite ? '已收藏' : '收藏' }}
        </button>
        <button
          v-if="currentView === 'company'"
          class="icon-button dark"
          type="button"
          title="设置"
          aria-label="打开设置"
          @click="openSettingsPage"
        >
          <Settings :size="17" />
        </button>
        <button v-if="currentView === 'etf'" class="ghost-button" type="button" @click="openIndexPage">
          <TrendingUp :size="17" />指数
        </button>
        <button v-if="currentView === 'etf'" class="ghost-button" type="button" @click="openCompanyPage">
          <ArrowLeft :size="17" />个股
        </button>
        <button v-if="currentView === 'index'" class="ghost-button" type="button" @click="openEtfPage">
          <TrendingUp :size="17" />ETF
        </button>
        <button v-if="currentView === 'index'" class="ghost-button" type="button" @click="openCompanyPage">
          <ArrowLeft :size="17" />个股
        </button>
        <button v-else-if="currentView === 'settings'" class="ghost-button" type="button" @click="openCompanyPage">
          <ArrowLeft :size="17" />返回财报
        </button>
      </nav>
    </header>

    <div v-if="favoriteNotice" class="favorite-toast" role="status">
      {{ favoriteNotice }}
    </div>

    <main class="workspace">
      <section v-if="currentView === 'settings'" class="settings-page">
        <header class="settings-page-head">
          <span>系统设置</span>
          <h1>数据与缓存</h1>
          <p>查看自动更新任务运行情况和本地 SQLite 缓存占用。</p>
        </header>

        <section class="refresh-task-panel">
          <div>
            <span>数据更新任务</span>
            <strong>
              {{ refreshStatus?.enabled ? `每 ${refreshStatus.intervalDays} 天自动检查` : '未启用' }}
            </strong>
          </div>
          <div>
            <span>待更新</span>
            <strong>{{ refreshStatus?.pendingTargets ?? 0 }}</strong>
          </div>
          <div>
            <span>上次运行</span>
            <strong>{{ refreshRunLabel(refreshStatus?.latestRun?.status) }}</strong>
            <small v-if="refreshStatus?.latestRun">
              {{ refreshStatus.latestRun.succeeded }}/{{ refreshStatus.latestRun.totalTargets }}
            </small>
          </div>
          <div>
            <span>下次检查</span>
            <strong>{{ formatDate(refreshStatus?.nextRunAt ?? undefined) }}</strong>
          </div>
          <button
            class="ghost-button blue"
            type="button"
            :disabled="refreshTaskLoading || refreshStatus?.running"
            @click="runRefreshTask"
          >
            <Loader2 v-if="refreshTaskLoading || refreshStatus?.running" class="spin-icon" :size="16" />
            <RefreshCw v-else :size="16" />
            {{ refreshTaskLoading || refreshStatus?.running ? '更新中' : '立即更新' }}
          </button>
        </section>

        <div v-if="refreshTaskNotice" class="refresh-task-notice">
          {{ refreshTaskNotice }}
        </div>

        <CacheManagerPanel
          :entries="cacheEntries"
          :loading="cacheEntriesLoading"
          :error="cacheEntriesError"
        />
      </section>

      <EtfPage v-else-if="currentView === 'etf'" />
      <IndexPage v-else-if="currentView === 'index'" />

      <section v-else class="content">
        <div v-if="favorites.length" class="favorite-strip" aria-label="收藏公司">
          <span>收藏</span>
          <button
            v-for="company in favorites"
            :key="companyKey(company)"
            :class="{ active: selectedCompany?.market === company.market && selectedCompany?.symbol === company.symbol }"
            type="button"
            @click="selectCompany(company)"
          >
            <i
              v-if="company.hasUnreadAnnouncements"
              class="favorite-unread-dot"
              :aria-label="`${company.unreadAnnouncementCount} 条新公告`"
            ></i>
            <Star :size="14" />
            <strong>{{ company.name }}</strong>
            <small>{{ company.displaySymbol }}</small>
          </button>
        </div>

        <div v-if="visibleRecentCompanies.length" class="favorite-strip recent-strip" aria-label="最近访问公司">
          <span>最近</span>
          <button
            v-for="company in visibleRecentCompanies"
            :key="companyKey(company)"
            type="button"
            @click="selectCompany(company)"
          >
            <Clock3 :size="14" />
            <strong>{{ company.name }}</strong>
            <small>{{ company.displaySymbol }}</small>
          </button>
        </div>

        <div class="company-card">
          <div class="company-title">
            <span class="market-badge">{{ marketLabel(selectedCompany?.market) }}</span>
            <div class="company-title-content">
              <div class="company-heading-row">
                <div class="company-name-block">
                  <div class="company-name-line">
                    <h1>{{ selectedCompany?.name ?? '选择公司' }}</h1>
                    <button
                      class="company-note-button"
                      :class="{ 'has-note': Boolean(activeCompanyInsight.note) }"
                      type="button"
                      :disabled="!selectedCompany"
                      @click="openNoteDialog"
                    >
                      <StickyNote :size="16" />
                      {{ activeCompanyInsight.note ? '修改备注' : '添加备注' }}
                    </button>
                  </div>
                  <p>{{ selectedCompany?.displaySymbol ?? '输入公司名或股票代码开始' }}</p>
                </div>
                <div class="company-note-preview" :class="{ empty: !activeCompanyInsight.note }">
                  <span>备注</span>
                  <p>{{ activeCompanyInsight.note || '暂无备注，点击“添加备注”记录你的看法。' }}</p>
                </div>
              </div>
              <div class="buy-point-field">
                <label :for="selectedCompany ? `buy-point-${selectedCompany.market}-${selectedCompany.symbol}` : 'buy-point'">
                  预估买点
                </label>
                <template v-if="buyPointEditing">
                  <input
                    :id="selectedCompany ? `buy-point-${selectedCompany.market}-${selectedCompany.symbol}` : 'buy-point'"
                    v-model="buyPointDraft"
                    type="text"
                    inputmode="decimal"
                    placeholder="例如：85–95 元"
                    :disabled="!selectedCompany"
                    aria-label="预估买点区间"
                    autofocus
                    @keydown.enter.prevent="saveBuyPoint"
                    @keydown.esc.prevent="cancelBuyPointEditing"
                  />
                  <button class="buy-point-save" type="button" @click="saveBuyPoint">保存</button>
                  <button class="buy-point-cancel" type="button" @click="cancelBuyPointEditing">取消</button>
                </template>
                <template v-else>
                  <strong class="buy-point-value" :class="{ empty: !activeCompanyInsight.buyPointRange }">
                    {{ activeCompanyInsight.buyPointRange || '暂未设置' }}
                  </strong>
                  <button
                    class="buy-point-edit"
                    type="button"
                    :disabled="!selectedCompany"
                    @click="startBuyPointEditing"
                  >
                    {{ activeCompanyInsight.buyPointRange ? '修改' : '设置' }}
                  </button>
                </template>
                <span v-if="showBuyPointReminder" class="buy-point-reminder">
                  <AlertTriangle :size="14" />
                  请更新最新预估买点
                </span>
              </div>
            </div>
          </div>

          <div class="quote-grid">
            <div>
              <span>数据源</span>
              <strong>AKShare</strong>
            </div>
            <div>
              <span>报表范围</span>
              <strong>自上市年起</strong>
            </div>
            <div>
              <span>更新时间</span>
              <strong>{{ formatDate(statements?.fetchedAt) }}</strong>
            </div>
            <div>
              <span>单位</span>
              <strong>{{ statements?.unit ?? '-' }}</strong>
            </div>
          </div>
        </div>

        <div class="statement-cache-strip">
          <span>财报数据</span>
          <strong>{{ statementCacheLabel }}</strong>
          <small>缓存刷新：{{ formatDate(statements?.cache?.refreshedAt) }}</small>
        </div>

        <AnnouncementPanel
          :feed="announcementFeed"
          :loading="announcementLoading"
          :error="announcementError"
        />

        <div v-if="statementError" class="status-banner">
          <AlertTriangle :size="18" />
          <span>{{ statementError }}</span>
        </div>

        <div class="year-strip" v-if="availableYears.length">
          <button
            v-for="year in availableYears"
            :key="year"
            :class="{ active: activeYears.includes(year) }"
            type="button"
            @click="toggleYear(year)"
          >
            {{ year }} 年报
          </button>
        </div>

        <div class="insight-grid">
          <MiniTrend :series="statements?.highlights ?? []" />
          <div class="metric-cards">
            <article v-for="card in summaryCards" :key="card.key" class="metric-card">
              <span>{{ card.label }}</span>
              <strong>{{ formatNumber(card.latest) }}</strong>
              <em :class="{ up: (card.delta ?? 0) >= 0, down: (card.delta ?? 0) < 0 }">
                <TrendingUp :size="15" />
                {{ card.delta === null ? '-' : `${card.delta.toFixed(2)}%` }}
              </em>
            </article>
          </div>
        </div>

        <PeerComparisonPanel
          :company="selectedCompany"
          :comparison="peerComparison"
          :loading="peerLoading"
          :error="peerError"
        />

        <PeerMetricChart
          :comparison="peerMetricComparison"
          :loading="peerMetricLoading"
          :error="peerMetricError"
          :metric-key="activePeerMetricKey"
          :mode="peerMetricMode"
          :cache-entries="cacheEntries"
          :selected-company-keys="selectedMetricCompanyKeys"
          @metric-change="changePeerMetric"
          @mode-change="changePeerMetricMode"
          @selection-change="changeMetricCompanies"
        />

        <CustomMetricChart :statements="statements" :active-years="activeYears" />

        <div class="toolbar">
          <div class="tabs">
            <button
              v-for="tab in [
                { type: 'balance', label: '资产负债表' },
                { type: 'income', label: '利润表' },
                { type: 'cashflow', label: '现金流量表' }
              ]"
              :key="tab.type"
              :class="{ active: activeStatement === tab.type }"
              type="button"
              @click="activeStatement = tab.type as StatementType"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="toolbar-actions">
            <button class="ghost-button blue" type="button" @click="selectedCompany && selectCompany(selectedCompany, true)">
              <RefreshCw :size="16" />刷新
            </button>
            <button class="ghost-button blue" type="button" @click="exportCsv">
              <Download :size="16" />导出
            </button>
          </div>
        </div>

        <div v-if="statementLoading" class="loading-panel">正在通过 AKShare 拉取财报数据...</div>

        <StatementTable v-else :table="activeTable" :active-years="activeYears" />
      </section>
    </main>

    <div
      v-if="noteDialogOpen"
      class="note-dialog-backdrop"
      role="presentation"
      @mousedown.self="closeNoteDialog"
    >
      <section class="note-dialog" role="dialog" aria-modal="true" aria-labelledby="company-note-title">
        <header>
          <div>
            <span>公司备注</span>
            <h2 id="company-note-title">{{ selectedCompany?.name }}</h2>
          </div>
          <button type="button" aria-label="关闭备注弹窗" @click="closeNoteDialog">
            <X :size="20" />
          </button>
        </header>
        <label for="company-note-content">记录你的判断、风险点或后续关注事项</label>
        <textarea
          id="company-note-content"
          v-model="noteDraft"
          rows="8"
          placeholder="例如：核心业务增长稳定，但需要继续观察毛利率和现金流……"
          autofocus
        ></textarea>
        <footer>
          <small>备注保存在本机 SQLite 数据库中</small>
          <div>
            <button class="note-dialog-cancel" type="button" @click="closeNoteDialog">取消</button>
            <button class="note-dialog-save" type="button" @click="saveNote">保存备注</button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>
