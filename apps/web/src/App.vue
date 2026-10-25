<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import AppTopbar from './components/AppTopbar.vue';
import CompanyNoteDialog from './components/CompanyNoteDialog.vue';
import CompanyResearchView from './components/CompanyResearchView.vue';
import { annualSummaryCards } from './finance/annual-summary';
import SettingsPage from './components/SettingsPage.vue';
import {
  getCacheEntries,
  getAnnouncements,
  getCompanyInsight,
  getFavorites,
  getPeerComparison,
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
  CompanyInsightDraft,
  AnnouncementFeed,
  CacheEntry,
  FavoriteCompany,
  FinancialStatements,
  MarketFilter,
  PeerComparison,
  StatementRefreshRuntimeStatus,
  StatementType
} from './types/finance';
import {
  companyFromUrl,
  companyKey,
  mergeCompanyList,
  sameCompany,
  searchOptionId,
  seedCompanies,
  syncCompanyUrl,
  viewFromUrl,
  writeViewUrl
} from './app/app-navigation';
import type { AppView, UrlMode } from './app/app-navigation';
import { isAbortError } from './app/app-formatters';
import { isBuyPointDue } from './services/company-insight';
import {
  loadRecentCompanies as readRecentCompanies,
  rememberRecentCompany as persistRecentCompany
} from './app/recent-companies';
import { exportStatementCsv } from './app/export-statements';

const EtfPage = defineAsyncComponent(() => import('./components/EtfPage.vue'));
const IndexPage = defineAsyncComponent(() => import('./components/IndexPage.vue'));
const PortfolioPage = defineAsyncComponent(() => import('./components/PortfolioPage.vue'));
const ScreenerPage = defineAsyncComponent(() => import('./components/ScreenerPage.vue'));

const initialCompany = companyFromUrl() ?? seedCompanies[0];
const currentView = ref<AppView>(viewFromUrl());
const query = ref(initialCompany.name);
const market = ref<MarketFilter>(initialCompany.market);
const companies = ref<CompanySearchResult[]>(mergeCompanyList([initialCompany], seedCompanies));
const selectedCompany = ref<CompanySearchResult | null>(initialCompany);
// API snapshots are replaced as a whole; proxying every financial cell makes
// repeated metric calculations unnecessarily expensive.
const statements = shallowRef<FinancialStatements | null>(null);
const peerComparison = ref<PeerComparison | null>(null);
const announcementFeed = ref<AnnouncementFeed | null>(null);
const activeStatement = ref<StatementType>('balance');
const selectedYears = ref<string[]>([]);
const searchLoading = ref(false);
const statementLoading = ref(false);
const peerLoading = ref(false);
const cacheEntriesLoading = ref(false);
const announcementLoading = ref(false);
const searchError = ref<string | null>(null);
const statementError = ref<string | null>(null);
const peerError = ref<string | null>(null);
const cacheEntriesError = ref<string | null>(null);
const announcementError = ref<string | null>(null);
const searchDropdownOpen = ref(false);
const activeSearchIndex = ref(-1);
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
const insightDraft = ref<CompanyInsightDraft>({
  note: '',
  thesis: '',
  risks: '',
  catalysts: '',
  questions: ''
});
const buyPointDraft = ref('');
const buyPointEditing = ref(false);
let favoriteNoticeTimer: number | undefined;
let statementRequestId = 0;
let peerRequestId = 0;
let announcementRequestId = 0;
let insightRequestId = 0;
let companyRequestController: AbortController | null = null;
let searchRequestController: AbortController | null = null;
let noteDialogReturnFocus: HTMLElement | null = null;

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
    return {
      market: 'a',
      symbol: '',
      note: '',
      thesis: '',
      risks: '',
      catalysts: '',
      questions: '',
      buyPointRange: '',
      buyPointUpdatedAt: null,
      updatedAt: null
    };
  }
  return companyInsights.value[companyKey(selectedCompany.value)] ?? {
    market: selectedCompany.value.market,
    symbol: selectedCompany.value.symbol,
    note: '',
    thesis: '',
    risks: '',
    catalysts: '',
    questions: '',
    buyPointRange: '',
    buyPointUpdatedAt: null,
    updatedAt: null
  };
});

const buyPointNow = ref(Date.now());
const buyPointTimer = setInterval(() => { buyPointNow.value = Date.now(); }, 60_000);
onUnmounted(() => clearInterval(buyPointTimer));
const showBuyPointReminder = computed(() => isBuyPointDue(
  activeCompanyInsight.value.buyPointRange,
  activeCompanyInsight.value.buyPointUpdatedAt,
  buyPointNow.value
));

const showSearchDropdown = computed(() => {
  return (
    searchDropdownOpen.value &&
    (searchLoading.value || Boolean(searchError.value) || query.value.trim().length > 0 || companies.value.length > 0)
  );
});

const activeSearchDescendant = computed(() => {
  const company = companies.value[activeSearchIndex.value];
  return company ? searchOptionId(company) : undefined;
});

const summaryCards = computed(() => annualSummaryCards(statements.value));

const statementCacheLabel = computed(() => {
  if (!statements.value?.cache) {
    return '加载中';
  }
  return statements.value.cache.hit ? '本地缓存' : '刚刚更新';
});

function openNoteDialog(): void {
  if (!selectedCompany.value) return;
  noteDialogReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  insightDraft.value = {
    note: activeCompanyInsight.value.note ?? '',
    thesis: activeCompanyInsight.value.thesis ?? '',
    risks: activeCompanyInsight.value.risks ?? '',
    catalysts: activeCompanyInsight.value.catalysts ?? '',
    questions: activeCompanyInsight.value.questions ?? ''
  };
  noteDialogOpen.value = true;
}

function closeNoteDialog(): void {
  noteDialogOpen.value = false;
  const returnFocus = noteDialogReturnFocus;
  noteDialogReturnFocus = null;
  void nextTick(() => returnFocus?.focus());
}

function startBuyPointEditing(): void {
  buyPointDraft.value = activeCompanyInsight.value.buyPointRange;
  buyPointEditing.value = true;
}

function cancelBuyPointEditing(): void {
  buyPointDraft.value = activeCompanyInsight.value.buyPointRange;
  buyPointEditing.value = false;
}

async function loadCompanyInsight(company: CompanySearchResult, signal?: AbortSignal): Promise<void> {
  const requestId = ++insightRequestId;
  try {
    const insight = await getCompanyInsight(company.market, company.symbol, signal);
    companyInsights.value = { ...companyInsights.value, [companyKey(company)]: insight };
    if (requestId === insightRequestId && sameCompany(company, selectedCompany.value)) {
      buyPointDraft.value = insight.buyPointRange;
    }
  } catch (error) {
    if (requestId === insightRequestId && !isAbortError(error)) {
      statementError.value = error instanceof Error ? error.message : '公司备注读取失败';
    }
  }
}

async function persistActiveCompanyInsight(
  input: CompanyInsightDraft & { buyPointRange: string }
): Promise<CompanyInsight | null> {
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
    note: (insightDraft.value.note ?? '').trim(),
    thesis: (insightDraft.value.thesis ?? '').trim(),
    risks: (insightDraft.value.risks ?? '').trim(),
    catalysts: (insightDraft.value.catalysts ?? '').trim(),
    questions: (insightDraft.value.questions ?? '').trim(),
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
  const saved = await persistActiveCompanyInsight({
    note: current.note,
    thesis: current.thesis,
    risks: current.risks,
    catalysts: current.catalysts,
    questions: current.questions,
    buyPointRange: nextValue
  });
  if (saved) {
    buyPointDraft.value = saved.buyPointRange;
    buyPointEditing.value = false;
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && noteDialogOpen.value) closeNoteDialog();
}

function syncViewUrl(view: AppView, mode: 'push' | 'replace' = 'push'): void {
  writeViewUrl(view, mode);
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

function openScreenerPage(): void {
  searchDropdownOpen.value = false;
  syncViewUrl('screener');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function navigateToView(view: AppView): void {
  if (view === 'company') {
    void openCompanyPage();
  } else if (view === 'settings') {
    void openSettingsPage();
  } else if (view === 'etf') {
    openEtfPage();
  } else if (view === 'index') {
    openIndexPage();
  } else if (view === 'portfolio') {
    searchDropdownOpen.value = false;
    syncViewUrl('portfolio');
    window.scrollTo({ top: 0, behavior: 'auto' });
  } else {
    openScreenerPage();
  }
}

async function openCompanyFromScreener(company: CompanySearchResult): Promise<void> {
  market.value = company.market;
  query.value = company.name;
  companies.value = mergeCompanyList([company], companies.value);
  syncViewUrl('company');
  await selectCompany(company);
}

function handleUrlNavigation(): void {
  currentView.value = viewFromUrl();
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (currentView.value === 'settings') {
    void Promise.all([loadRefreshStatus(), loadCacheEntries()]);
    return;
  }
  if (currentView.value === 'etf' || currentView.value === 'index' || currentView.value === 'screener' || currentView.value === 'portfolio') return;

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

function loadRecentCompanies(): void {
  recentCompanies.value = readRecentCompanies();
}

function rememberRecentCompany(company: CompanySearchResult): void {
  recentCompanies.value = persistRecentCompany(company, recentCompanies.value);
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

function resetSearchSelection(): void {
  activeSearchIndex.value = -1;
}

function handleSearchInput(): void {
  resetSearchSelection();
  searchRequestController?.abort();
}

function closeSearchDropdown(): void {
  searchDropdownOpen.value = false;
  resetSearchSelection();
}

function handleSearchFocusOut(event: FocusEvent): void {
  const current = event.currentTarget;
  const next = event.relatedTarget;
  if (current instanceof HTMLElement && next instanceof Node && current.contains(next)) {
    return;
  }
  closeSearchDropdown();
}

function submitSearch(): void {
  searchDropdownOpen.value = true;
  resetSearchSelection();
  void runSearch();
}

function handleSearchEnter(): void {
  const activeCompany = companies.value[activeSearchIndex.value];
  if (searchDropdownOpen.value && activeCompany) {
    selectSearchCompany(activeCompany);
    return;
  }
  submitSearch();
}

function moveSearchSelection(direction: 1 | -1): void {
  searchDropdownOpen.value = true;
  if (searchLoading.value || searchError.value || !companies.value.length) return;
  const count = companies.value.length;
  activeSearchIndex.value = activeSearchIndex.value < 0
    ? (direction > 0 ? 0 : count - 1)
    : (activeSearchIndex.value + direction + count) % count;
}

function selectSearchMarket(value: MarketFilter): void {
  if (market.value === value) return;
  market.value = value;
  submitSearch();
}

function selectSearchCompany(company: CompanySearchResult): void {
  searchRequestController?.abort();
  searchRequestController = null;
  closeSearchDropdown();
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
  searchRequestController?.abort();
  searchRequestController = null;
  const text = query.value.trim();
  if (!text) {
    companies.value = seedCompanies.filter(
      (company) => market.value === 'all' || company.market === market.value
    );
    searchError.value = null;
    searchLoading.value = false;
    return;
  }

  const requestController = new AbortController();
  searchRequestController = requestController;
  searchLoading.value = true;
  searchError.value = null;
  try {
    const results = await searchCompanies(text, market.value, requestController.signal);
    if (requestController.signal.aborted) return;
    companies.value = results;
    if (results.length && !selectedCompany.value) {
      await selectCompany(results[0]);
    }
  } catch (error) {
    if (isAbortError(error)) return;
    searchError.value = error instanceof Error ? error.message : '搜索失败';
    companies.value = seedCompanies.filter(
      (company) =>
        market.value === 'all' || company.market === market.value
    );
  } finally {
    if (searchRequestController === requestController) {
      searchRequestController = null;
      searchLoading.value = false;
    }
  }
}

async function selectCompany(company: CompanySearchResult, refresh = false, urlMode: UrlMode = 'push'): Promise<void> {
  const requestId = ++statementRequestId;
  companyRequestController?.abort();
  const requestController = new AbortController();
  companyRequestController = requestController;
  const { signal } = requestController;
  companies.value = mergeCompanyList([company], companies.value);
  selectedCompany.value = company;
  rememberRecentCompany(company);
  if (urlMode !== 'none') {
    syncCompanyUrl(company, urlMode);
  }
  statementLoading.value = true;
  statementError.value = null;
  statements.value = null;
  selectedYears.value = [];
  peerComparison.value = null;
  activeStatement.value = 'balance';
  void loadPeerComparison(company, signal);
  void loadAnnouncements(company, signal);
  void loadCompanyInsight(company, signal);
  try {
    const payload = await getStatements(company.market, company.symbol, 0, refresh, signal);
    if (requestId !== statementRequestId || !sameCompany(company, selectedCompany.value)) {
      return;
    }
    statements.value = payload;
    if (payload.company.name) {
      const enrichedCompany = {
        ...company,
        displaySymbol: payload.company.displaySymbol || company.displaySymbol,
        name: payload.company.name
      };
      selectedCompany.value = enrichedCompany;
      companies.value = mergeCompanyList([enrichedCompany], companies.value);
      rememberRecentCompany(enrichedCompany);
    }
    selectedYears.value = [...payload.years];
  } catch (error) {
    if (requestId === statementRequestId && !isAbortError(error)) {
      statements.value = null;
      selectedYears.value = [];
      statementError.value = error instanceof Error ? error.message : '财报查询失败';
    }
  } finally {
    if (requestId === statementRequestId) {
      statementLoading.value = false;
    }
  }
}

async function loadAnnouncements(company: CompanySearchResult, signal?: AbortSignal): Promise<void> {
  const requestId = ++announcementRequestId;
  announcementLoading.value = true;
  announcementError.value = null;
  announcementFeed.value = null;
  try {
    const feed = await getAnnouncements(company.market, company.symbol, signal);
    if (requestId !== announcementRequestId || signal?.aborted) return;
    announcementFeed.value = feed;
    const nextFavorites = await markAnnouncementsViewed(company.market, company.symbol, signal);
    if (requestId === announcementRequestId && !signal?.aborted) {
      favorites.value = nextFavorites;
    }
  } catch (error) {
    if (requestId === announcementRequestId && !isAbortError(error)) {
      announcementError.value = error instanceof Error ? error.message : '公告读取失败';
    }
  } finally {
    if (requestId === announcementRequestId) {
      announcementLoading.value = false;
    }
  }
}

async function loadPeerComparison(company: CompanySearchResult, signal?: AbortSignal): Promise<void> {
  const requestId = ++peerRequestId;
  peerLoading.value = true;
  peerError.value = null;
  peerComparison.value = null;

  try {
    const payload = await getPeerComparison(company.market, company.symbol, 20, signal);
    if (requestId === peerRequestId && !signal?.aborted) {
      peerComparison.value = payload;
    }
  } catch (error) {
    if (requestId === peerRequestId && !isAbortError(error)) {
      peerError.value = error instanceof Error ? error.message : '同行对比获取失败';
    }
  } finally {
    if (requestId === peerRequestId) {
      peerLoading.value = false;
    }
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
  exportStatementCsv(
    activeTable.value,
    activeYears.value,
    `${selectedCompany.value?.displaySymbol ?? 'statements'}-${activeTable.value.type}.csv`
  );
}

function updatePageTitle(): void {
  if (currentView.value === 'company' && selectedCompany.value) {
    document.title = `${selectedCompany.value.name}（${selectedCompany.value.displaySymbol}）- 财报查询台`;
    return;
  }
  const titles: Record<Exclude<AppView, 'company'>, string> = {
    settings: '系统设置 - 财报查询台',
    etf: 'ETF 研究 - 财报查询台',
    index: '指数研究 - 财报查询台',
    portfolio: '持仓估值表 - 财报查询台',
    screener: '低 PE 筛选 - 财报查询台'
  };
  document.title = currentView.value === 'company'
    ? '财报查询台'
    : titles[currentView.value];
}

watch(selectedCompany, () => {
  buyPointDraft.value = activeCompanyInsight.value.buyPointRange;
  buyPointEditing.value = false;
  noteDialogOpen.value = false;
});

watch([currentView, selectedCompany], updatePageTitle, { immediate: true });

onMounted(async () => {
  window.addEventListener('popstate', handleUrlNavigation);
  window.addEventListener('keydown', handleGlobalKeydown);
  loadRecentCompanies();
  await Promise.all([loadRefreshStatus(), loadCacheEntries(), loadFavorites()]);
  if (currentView.value === 'company') {
    if (selectedCompany.value) {
      await selectCompany(selectedCompany.value, false, 'replace');
    }
  }
});

onUnmounted(() => {
  companyRequestController?.abort();
  searchRequestController?.abort();
  window.removeEventListener('popstate', handleUrlNavigation);
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="app-shell">
    <AppTopbar
      v-model:query="query"
      v-model:market="market"
      v-model:active-search-index="activeSearchIndex"
      :current-view="currentView"
      :companies="companies"
      :selected-company="selectedCompany"
      :search-loading="searchLoading"
      :search-error="searchError"
      :show-search-dropdown="showSearchDropdown"
      :active-search-descendant="activeSearchDescendant"
      :market-options="marketOptions"
      :selected-is-favorite="selectedIsFavorite"
      :favorite-loading="favoriteLoading"
      @open-search="openSearchDropdown"
      @search-focus-out="handleSearchFocusOut"
      @search-input="handleSearchInput"
      @search-enter="handleSearchEnter"
      @move-search="moveSearchSelection"
      @close-search="closeSearchDropdown"
      @submit-search="submitSearch"
      @select-market="selectSearchMarket"
      @select-company="selectSearchCompany"
      @navigate="navigateToView"
      @refresh-company="selectedCompany && selectCompany(selectedCompany, true)"
      @toggle-favorite="toggleFavorite"
    />

    <div v-if="favoriteNotice" class="favorite-toast" role="status">
      {{ favoriteNotice }}
    </div>

    <main class="workspace">
      <SettingsPage
        v-if="currentView === 'settings'"
        :refresh-status="refreshStatus"
        :refresh-task-loading="refreshTaskLoading"
        :refresh-task-notice="refreshTaskNotice"
        :cache-entries="cacheEntries"
        :cache-entries-loading="cacheEntriesLoading"
        :cache-entries-error="cacheEntriesError"
        @refresh="runRefreshTask"
      />

      <EtfPage v-else-if="currentView === 'etf'" />
      <IndexPage v-else-if="currentView === 'index'" />
      <PortfolioPage v-else-if="currentView === 'portfolio'" />
      <ScreenerPage v-else-if="currentView === 'screener'" />

      <CompanyResearchView
        v-else
        v-model:buy-point-draft="buyPointDraft"
        v-model:active-statement="activeStatement"
        :favorites="favorites"
        :visible-recent-companies="visibleRecentCompanies"
        :selected-company="selectedCompany"
        :active-company-insight="activeCompanyInsight"
        :note-dialog-open="noteDialogOpen"
        :buy-point-editing="buyPointEditing"
        :show-buy-point-reminder="showBuyPointReminder"
        :statements="statements"
        :statement-cache-label="statementCacheLabel"
        :announcement-feed="announcementFeed"
        :announcement-loading="announcementLoading"
        :announcement-error="announcementError"
        :statement-loading="statementLoading"
        :statement-error="statementError"
        :available-years="availableYears"
        :active-years="activeYears"
        :summary-cards="summaryCards"
        :peer-comparison="peerComparison"
        :peer-loading="peerLoading"
        :peer-error="peerError"
        :active-table="activeTable"
        @select-company="selectCompany"
        @open-note="openNoteDialog"
        @start-buy-point-editing="startBuyPointEditing"
        @save-buy-point="saveBuyPoint"
        @cancel-buy-point-editing="cancelBuyPointEditing"
        @toggle-year="toggleYear"
        @refresh-company="selectedCompany && selectCompany(selectedCompany, true)"
        @export-table="exportCsv"
      />
    </main>

    <CompanyNoteDialog
      v-model="insightDraft"
      :open="noteDialogOpen"
      :company-name="selectedCompany?.name"
      @close="closeNoteDialog"
      @save="saveNote"
    />
  </div>
</template>
