<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  Database,
  Download,
  RefreshCw,
  Search,
  Settings,
  Star,
  TrendingUp
} from 'lucide-vue-next';
import CompanyRail from './components/CompanyRail.vue';
import MiniTrend from './components/MiniTrend.vue';
import StatementTable from './components/StatementTable.vue';
import { getFavorites, getStatements, removeFavorite, saveFavorite, searchCompanies } from './services/api';
import type {
  CompanySearchResult,
  FavoriteCompany,
  FinancialStatements,
  MarketFilter,
  StatementType
} from './types/finance';

const seedCompanies: CompanySearchResult[] = [
  { market: 'hk', symbol: '00700', displaySymbol: '00700.HK', name: '腾讯控股', source: 'seed' },
  { market: 'a', symbol: '600519', displaySymbol: '600519.SH', name: '贵州茅台', source: 'seed' },
  { market: 'hk', symbol: '09988', displaySymbol: '09988.HK', name: '阿里巴巴-W', source: 'seed' },
  { market: 'a', symbol: '601398', displaySymbol: '601398.SH', name: '工商银行', source: 'seed' },
  { market: 'hk', symbol: '03690', displaySymbol: '03690.HK', name: '美团-W', source: 'seed' }
];

const query = ref('腾讯');
const market = ref<MarketFilter>('all');
const companies = ref<CompanySearchResult[]>(seedCompanies);
const selectedCompany = ref<CompanySearchResult | null>(seedCompanies[0]);
const statements = ref<FinancialStatements | null>(null);
const activeStatement = ref<StatementType>('balance');
const selectedYears = ref<string[]>([]);
const searchLoading = ref(false);
const statementLoading = ref(false);
const searchError = ref<string | null>(null);
const statementError = ref<string | null>(null);
const favorites = ref<FavoriteCompany[]>([]);
const favoriteLoading = ref(false);
const favoriteNotice = ref<string | null>(null);
let searchTimer: number | undefined;
let favoriteNoticeTimer: number | undefined;

const activeTable = computed(() =>
  statements.value?.tables.find((table) => table.type === activeStatement.value)
);

const availableYears = computed(() => statements.value?.years ?? []);

const activeYears = computed(() => {
  const chosen = selectedYears.value.length ? selectedYears.value : availableYears.value;
  return chosen.slice(0, 10);
});

const selectedIsFavorite = computed(() => {
  if (!selectedCompany.value) return false;
  return favorites.value.some((company) => companyKey(company) === companyKey(selectedCompany.value!));
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

function companyKey(company: Pick<CompanySearchResult, 'market' | 'symbol'>): string {
  return `${company.market}:${company.symbol}`;
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

async function loadFavorites(): Promise<void> {
  try {
    favorites.value = await getFavorites();
  } catch (error) {
    favorites.value = [];
    showFavoriteNotice(error instanceof Error ? error.message : '收藏读取失败');
  }
}

function showFavoriteNotice(message: string): void {
  favoriteNotice.value = message;
  window.clearTimeout(favoriteNoticeTimer);
  favoriteNoticeTimer = window.setTimeout(() => {
    favoriteNotice.value = null;
  }, 1800);
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

async function selectCompany(company: CompanySearchResult, refresh = false): Promise<void> {
  selectedCompany.value = company;
  statementLoading.value = true;
  statementError.value = null;
  activeStatement.value = 'balance';
  try {
    statements.value = await getStatements(company.market, company.symbol, 10, refresh);
    selectedYears.value = statements.value.years.slice(0, 10);
  } catch (error) {
    statements.value = null;
    statementError.value = error instanceof Error ? error.message : '财报查询失败';
  } finally {
    statementLoading.value = false;
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

onMounted(async () => {
  await loadFavorites();
  await runSearch();
  if (selectedCompany.value) {
    await selectCompany(selectedCompany.value);
  }
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><Database :size="18" /></span>
        <strong>财报查询台</strong>
      </div>

      <label class="global-search">
        <Search :size="20" />
        <input v-model="query" type="search" placeholder="公司/代码，例如：腾讯、00700、600519" />
        <button type="button" @click="runSearch">搜索</button>
      </label>

      <nav class="top-actions" aria-label="工具">
        <button class="ghost-button" type="button" title="刷新财报" @click="selectedCompany && selectCompany(selectedCompany, true)">
          <RefreshCw :size="17" />刷新
        </button>
        <button
          class="ghost-button"
          :class="{ 'favorite-active': selectedIsFavorite }"
          type="button"
          :title="favoriteLoading ? '保存中' : selectedIsFavorite ? '取消收藏' : '收藏'"
          :disabled="!selectedCompany || favoriteLoading"
          @click="toggleFavorite"
        >
          <Star :size="17" />{{ favoriteLoading ? '保存中' : selectedIsFavorite ? '已收藏' : '收藏' }}
        </button>
        <button class="icon-button dark" type="button" title="设置">
          <Settings :size="17" />
        </button>
      </nav>
    </header>

    <div v-if="favoriteNotice" class="favorite-toast" role="status">
      {{ favoriteNotice }}
    </div>

    <main class="workspace">
      <CompanyRail
        :companies="companies"
        :selected="selectedCompany"
        :loading="searchLoading"
        :market="market"
        :error="searchError"
        @select="selectCompany"
        @refresh="runSearch"
        @change-market="market = $event"
      />

      <section class="content">
        <div v-if="favorites.length" class="favorite-strip" aria-label="收藏公司">
          <span>收藏</span>
          <button
            v-for="company in favorites"
            :key="companyKey(company)"
            :class="{ active: selectedCompany?.market === company.market && selectedCompany?.symbol === company.symbol }"
            type="button"
            @click="selectCompany(company)"
          >
            <Star :size="14" />
            <strong>{{ company.name }}</strong>
            <small>{{ company.displaySymbol }}</small>
          </button>
        </div>

        <div class="company-card">
          <div class="company-title">
            <span class="market-badge">{{ marketLabel(selectedCompany?.market) }}</span>
            <div>
              <h1>{{ selectedCompany?.name ?? '选择公司' }}</h1>
              <p>{{ selectedCompany?.displaySymbol ?? '输入公司名或股票代码开始' }}</p>
            </div>
          </div>

          <div class="quote-grid">
            <div>
              <span>数据源</span>
              <strong>AKShare</strong>
            </div>
            <div>
              <span>报表范围</span>
              <strong>最近 10 年</strong>
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

        <div v-if="statementError" class="status-banner">
          <AlertTriangle :size="18" />
          <span>{{ statementError }}</span>
        </div>

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

        <div v-if="statementLoading" class="loading-panel">正在通过 AKShare 拉取财报数据...</div>

        <StatementTable v-else :table="activeTable" :active-years="activeYears" />
      </section>
    </main>
  </div>
</template>
