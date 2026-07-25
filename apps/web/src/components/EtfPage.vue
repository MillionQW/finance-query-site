<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, RefreshCw, Search, Star } from 'lucide-vue-next';
import EtfPriceChart from './EtfPriceChart.vue';
import {
  getEtfDetail,
  getEtfValuation,
  getEtfs,
  getFavoriteEtfs,
  isRequestAbort,
  removeFavoriteEtf,
  saveFavoriteEtf
} from '../services/api';
import type {
  EtfDetailResponse,
  EtfExchange,
  EtfMarketResponse,
  EtfQuote,
  EtfSortKey,
  EtfValuation,
  FavoriteEtf
} from '../types/etf';

type ExchangeFilter = 'all' | EtfExchange;

const query = ref('');
const exchange = ref<ExchangeFilter>('all');
const sort = ref<EtfSortKey>('amount');
const order = ref<'asc' | 'desc'>('desc');
const market = ref<EtfMarketResponse | null>(null);
const detail = ref<EtfDetailResponse | null>(null);
const valuation = ref<EtfValuation | null>(null);
const selectedSymbol = ref(etfSymbolFromUrl());
const favorites = ref<FavoriteEtf[]>([]);
const marketLoading = ref(false);
const detailLoading = ref(false);
const valuationLoading = ref(false);
const favoriteLoading = ref(false);
const marketError = ref<string | null>(null);
const detailError = ref<string | null>(null);
const valuationError = ref<string | null>(null);
let searchTimer: number | undefined;
let marketRequestController: AbortController | null = null;
let detailRequestController: AbortController | null = null;
let valuationRequestController: AbortController | null = null;

const visibleItems = computed(() => market.value?.items ?? []);
const selectedIsFavorite = computed(() => favorites.value.some((item) => item.symbol === selectedSymbol.value));
const selectedQuote = computed(() => detail.value?.quote ?? market.value?.items.find((item) => item.symbol === selectedSymbol.value) ?? null);
const cacheLabel = computed(() => {
  if (!market.value) return '加载中';
  if (market.value.cache.stale) return '陈旧缓存';
  return market.value.cache.hit ? '本地缓存' : '刚刚更新';
});

const sortOptions: Array<{ value: EtfSortKey; label: string }> = [
  { value: 'amount', label: '成交额' },
  { value: 'changePercent', label: '涨跌幅' },
  { value: 'marketCap', label: '基金规模' },
  { value: 'turnoverRate', label: '换手率' },
  { value: 'premiumRate', label: '折溢价' },
  { value: 'symbol', label: '代码' }
];

watch([query, sort, order, exchange], () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void loadMarket(), 320);
});

onMounted(async () => {
  window.addEventListener('popstate', handlePopState);
  await Promise.all([loadFavorites(), loadMarket(), loadDetail(selectedSymbol.value), loadValuation(selectedSymbol.value)]);
});

onUnmounted(() => {
  window.clearTimeout(searchTimer);
  window.removeEventListener('popstate', handlePopState);
  marketRequestController?.abort();
  detailRequestController?.abort();
  valuationRequestController?.abort();
});

async function loadMarket(refresh = false): Promise<void> {
  marketRequestController?.abort();
  const requestController = new AbortController();
  marketRequestController = requestController;
  marketLoading.value = true;
  marketError.value = null;
  try {
    market.value = await getEtfs({
      q: query.value.trim(),
      limit: 100,
      sort: sort.value,
      order: order.value,
      exchange: exchange.value,
      refresh,
      signal: requestController.signal
    });
  } catch (error) {
    if (!isRequestAbort(error)) {
      marketError.value = error instanceof Error ? error.message : 'ETF 行情读取失败';
    }
  } finally {
    if (marketRequestController === requestController) {
      marketRequestController = null;
      marketLoading.value = false;
    }
  }
}

async function loadDetail(symbol: string, refresh = false): Promise<void> {
  detailRequestController?.abort();
  const requestController = new AbortController();
  detailRequestController = requestController;
  detailLoading.value = true;
  detailError.value = null;
  detail.value = null;
  try {
    detail.value = await getEtfDetail(symbol, 10, refresh, requestController.signal);
  } catch (error) {
    if (detailRequestController === requestController && !isRequestAbort(error)) {
      detail.value = null;
      detailError.value = error instanceof Error ? error.message : 'ETF 详情读取失败';
    }
  } finally {
    if (detailRequestController === requestController) {
      detailRequestController = null;
      detailLoading.value = false;
    }
  }
}

async function loadValuation(symbol: string, refresh = false): Promise<void> {
  valuationRequestController?.abort();
  const requestController = new AbortController();
  valuationRequestController = requestController;
  valuationLoading.value = true;
  valuationError.value = null;
  valuation.value = null;
  try {
    valuation.value = await getEtfValuation(symbol, refresh, requestController.signal);
  } catch (error) {
    if (valuationRequestController === requestController && !isRequestAbort(error)) {
      valuationError.value = error instanceof Error ? error.message : 'ETF 估值读取失败';
    }
  } finally {
    if (valuationRequestController === requestController) {
      valuationRequestController = null;
      valuationLoading.value = false;
    }
  }
}

async function loadFavorites(): Promise<void> {
  try {
    favorites.value = await getFavoriteEtfs();
  } catch {
    favorites.value = [];
  }
}

function selectEtf(item: EtfQuote, mode: 'push' | 'none' = 'push'): void {
  selectedSymbol.value = item.symbol;
  if (mode === 'push') syncEtfUrl(item.symbol);
  window.scrollTo({ top: 0, behavior: 'auto' });
  void loadDetail(item.symbol);
  void loadValuation(item.symbol);
}

async function refreshAll(): Promise<void> {
  await Promise.all([loadDetail(selectedSymbol.value, true), loadValuation(selectedSymbol.value, true)]);
  await loadMarket();
}

async function toggleFavorite(): Promise<void> {
  if (favoriteLoading.value) return;
  favoriteLoading.value = true;
  try {
    favorites.value = selectedIsFavorite.value
      ? await removeFavoriteEtf(selectedSymbol.value)
      : await saveFavoriteEtf(selectedSymbol.value);
  } finally {
    favoriteLoading.value = false;
  }
}

function toggleOrder(): void {
  order.value = order.value === 'desc' ? 'asc' : 'desc';
}

function handlePopState(): void {
  const nextSymbol = etfSymbolFromUrl();
  if (nextSymbol === selectedSymbol.value) return;
  selectedSymbol.value = nextSymbol;
  void loadDetail(nextSymbol);
  void loadValuation(nextSymbol);
}

function syncEtfUrl(symbol: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set('view', 'etf');
  params.set('etf', symbol);
  window.history.pushState({ view: 'etf', etf: symbol }, '', `${window.location.pathname}?${params.toString()}`);
}

function etfSymbolFromUrl(): string {
  const value = new URLSearchParams(window.location.search).get('etf') ?? '510300';
  return value.replace(/\D/g, '').padStart(6, '0').slice(-6);
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
}

function formatPrice(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 4 }).format(value);
}

function formatCompact(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return formatNumber(value);
}

function formatPercent(value: number | null, decimalInput = false): string {
  if (value === null) return '-';
  const percent = decimalInput ? value * 100 : value;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <section class="etf-page">
    <header class="etf-page-toolbar">
      <div>
        <h1>ETF 研究</h1>
        <span>{{ market?.total ?? 0 }} 只场内基金</span>
      </div>
      <div class="etf-search-control">
        <Search :size="18" />
        <input v-model="query" type="search" placeholder="搜索 ETF 名称或代码" aria-label="搜索 ETF 名称或代码" />
        <Loader2 v-if="marketLoading" class="spin-icon" :size="16" />
      </div>
      <button class="ghost-button blue" type="button" :disabled="detailLoading || marketLoading" @click="refreshAll">
        <Loader2 v-if="detailLoading || marketLoading" class="spin-icon" :size="16" />
        <RefreshCw v-else :size="16" />刷新
      </button>
    </header>

    <div v-if="marketError" class="status-banner">{{ marketError }}</div>

    <section v-if="selectedQuote" class="etf-quote-band">
      <div class="etf-identity">
        <span>{{ selectedQuote.exchange === 'sh' ? '沪市 ETF' : '深市 ETF' }}</span>
        <h2>{{ selectedQuote.name }}</h2>
        <strong>{{ selectedQuote.displaySymbol }}</strong>
      </div>
      <div class="etf-live-price">
        <strong>{{ formatPrice(selectedQuote.latestPrice) }}</strong>
        <span :class="{ up: (selectedQuote.changePercent ?? 0) >= 0, down: (selectedQuote.changePercent ?? 0) < 0 }">
          {{ formatPercent(selectedQuote.changePercent) }}
        </span>
      </div>
      <dl class="etf-quote-facts">
        <div><dt>IOPV</dt><dd>{{ formatPrice(selectedQuote.iopv) }}</dd></div>
        <div><dt>折溢价</dt><dd :class="{ up: (selectedQuote.premiumRate ?? 0) > 0, down: (selectedQuote.premiumRate ?? 0) < 0 }">{{ formatPercent(selectedQuote.premiumRate) }}</dd></div>
        <div><dt>成交额</dt><dd>{{ formatCompact(selectedQuote.amount) }}</dd></div>
        <div><dt>换手率</dt><dd>{{ formatPercent(selectedQuote.turnoverRate) }}</dd></div>
        <div><dt>基金规模</dt><dd>{{ formatCompact(selectedQuote.marketCap) }}</dd></div>
        <div><dt>最新份额</dt><dd>{{ formatCompact(selectedQuote.latestShares) }}</dd></div>
      </dl>
      <div class="etf-quote-actions">
        <button
          type="button"
          class="ghost-button"
          :class="{ 'favorite-active': selectedIsFavorite }"
          :disabled="favoriteLoading"
          @click="toggleFavorite"
        >
          <Star :size="16" />{{ selectedIsFavorite ? '已收藏' : '收藏' }}
        </button>
        <small>{{ cacheLabel }} · {{ formatDate(market?.refreshedAt ?? null) }}</small>
      </div>
    </section>

    <div v-if="detailError" class="status-banner">{{ detailError }}</div>
    <div v-if="detailLoading && !detail" class="loading-panel"><Loader2 class="spin-icon" :size="18" />正在读取 ETF 历史行情...</div>

    <div v-if="detail" class="etf-analysis-grid">
      <EtfPriceChart :history="detail.history" :symbol="detail.quote.displaySymbol" />
      <section class="etf-risk-panel">
        <header>
          <div>
            <span>收益与风险</span>
            <h2>区间分析</h2>
          </div>
          <small>{{ detail.metrics.tradingDays }} 个交易日</small>
        </header>
        <div class="etf-valuation-row" :class="{ unavailable: valuation && !valuation.available }">
          <div>
            <span>跟踪指数市盈率</span>
            <strong v-if="valuation?.available">{{ formatNumber(valuation.peTotalShares) }}<small>倍</small></strong>
            <strong v-else-if="valuationLoading"><Loader2 class="spin-icon" :size="18" /></strong>
            <strong v-else>-</strong>
          </div>
          <dl v-if="valuation?.available">
            <div><dt>跟踪指数</dt><dd>{{ valuation.trackingIndexName }} · {{ valuation.trackingIndexCode }}</dd></div>
            <div><dt>计算用股本 PE</dt><dd>{{ formatNumber(valuation.peCalculatedShares) }} 倍</dd></div>
            <div><dt>估值日期</dt><dd>{{ valuation.valuationDate ?? '-' }}</dd></div>
          </dl>
          <p v-else-if="valuation && !valuation.available">{{ valuation.unavailableReason }}</p>
          <p v-else-if="valuationError">{{ valuationError }}</p>
          <p v-else>正在匹配跟踪指数估值...</p>
        </div>
        <div class="etf-risk-grid">
          <div><span>20日价格收益</span><strong :class="{ up: (detail.metrics.return20d ?? 0) >= 0, down: (detail.metrics.return20d ?? 0) < 0 }">{{ formatPercent(detail.metrics.return20d, true) }}</strong></div>
          <div><span>60日价格收益</span><strong :class="{ up: (detail.metrics.return60d ?? 0) >= 0, down: (detail.metrics.return60d ?? 0) < 0 }">{{ formatPercent(detail.metrics.return60d, true) }}</strong></div>
          <div><span>今年以来</span><strong :class="{ up: (detail.metrics.returnYtd ?? 0) >= 0, down: (detail.metrics.returnYtd ?? 0) < 0 }">{{ formatPercent(detail.metrics.returnYtd, true) }}</strong></div>
          <div><span>年化价格收益</span><strong>{{ formatPercent(detail.metrics.annualizedReturn, true) }}</strong></div>
          <div><span>年化波动</span><strong>{{ formatPercent(detail.metrics.annualizedVolatility, true) }}</strong></div>
          <div><span>最大回撤</span><strong class="down">{{ formatPercent(detail.metrics.maxDrawdown, true) }}</strong></div>
          <div><span>当前回撤</span><strong class="down">{{ formatPercent(detail.metrics.currentDrawdown, true) }}</strong></div>
          <div><span>夏普比率</span><strong>{{ formatNumber(detail.metrics.sharpeRatio) }}</strong></div>
          <div><span>区间最高</span><strong>{{ formatPrice(detail.metrics.periodHigh) }}</strong></div>
          <div><span>区间最低</span><strong>{{ formatPrice(detail.metrics.periodLow) }}</strong></div>
        </div>
      </section>
    </div>

    <section class="etf-market-panel">
      <header class="etf-market-head">
        <div>
          <span>ETF 行情</span>
          <h2>市场筛选</h2>
        </div>
        <div class="etf-market-controls">
          <div class="etf-exchange-tabs" aria-label="ETF 市场">
            <button type="button" :class="{ active: exchange === 'all' }" @click="exchange = 'all'">全部</button>
            <button type="button" :class="{ active: exchange === 'sh' }" @click="exchange = 'sh'">沪市</button>
            <button type="button" :class="{ active: exchange === 'sz' }" @click="exchange = 'sz'">深市</button>
          </div>
          <label>
            <span>排序</span>
            <select v-model="sort">
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <button class="etf-order-button" type="button" :title="order === 'desc' ? '降序' : '升序'" @click="toggleOrder">
            <ArrowDown v-if="order === 'desc'" :size="16" />
            <ArrowUp v-else-if="order === 'asc'" :size="16" />
            <ArrowUpDown v-else :size="16" />
          </button>
        </div>
      </header>

      <div class="etf-table-wrap">
        <table class="etf-table">
          <thead>
            <tr>
              <th>代码</th><th>名称</th><th>最新价</th><th>涨跌幅</th><th>成交额</th><th>换手率</th><th>折溢价</th><th>基金规模</th><th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in visibleItems"
              :key="item.symbol"
              :class="{ selected: item.symbol === selectedSymbol }"
              @click="selectEtf(item)"
            >
              <td><button type="button" @click.stop="selectEtf(item)">{{ item.displaySymbol }}</button></td>
              <th>{{ item.name }}</th>
              <td>{{ formatPrice(item.latestPrice) }}</td>
              <td :class="{ up: (item.changePercent ?? 0) >= 0, down: (item.changePercent ?? 0) < 0 }">{{ formatPercent(item.changePercent) }}</td>
              <td>{{ formatCompact(item.amount) }}</td>
              <td>{{ formatPercent(item.turnoverRate) }}</td>
              <td :class="{ up: (item.premiumRate ?? 0) > 0, down: (item.premiumRate ?? 0) < 0 }">{{ formatPercent(item.premiumRate) }}</td>
              <td>{{ formatCompact(item.marketCap) }}</td>
              <td>{{ item.quoteUpdatedAt ? item.quoteUpdatedAt.slice(5, 16).replace('T', ' ') : '-' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="!marketLoading && !visibleItems.length" class="etf-table-empty">没有匹配的 ETF</div>
      </div>
    </section>
  </section>
</template>
