<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Loader2, RefreshCw, Search, Star } from 'lucide-vue-next';
import IndexHistoryChart from './IndexHistoryChart.vue';
import {
  getFavoriteIndices,
  getIndexDetail,
  getIndices,
  getIndexValuation,
  isRequestAbort,
  removeFavoriteIndex,
  saveFavoriteIndex
} from '../services/api';
import type {
  FavoriteIndex,
  IndexDetailResponse,
  IndexMarket,
  IndexMarketResponse,
  IndexQuote,
  IndexValuation
} from '../types/index';

const query = ref('');
const marketFilter = ref<'all' | IndexMarket>('all');
const market = ref<IndexMarketResponse | null>(null);
const detail = ref<IndexDetailResponse | null>(null);
const favorites = ref<FavoriteIndex[]>([]);
const selectedKey = ref(keyFromUrl());
const marketLoading = ref(false);
const detailLoading = ref(false);
const favoriteLoading = ref(false);
const error = ref<string | null>(null);
const valuation = ref<IndexValuation | null>(null);
const valuationLoading = ref(false);
const valuationError = ref<string | null>(null);
let timer: number | undefined;
let marketRequestController: AbortController | null = null;
let detailRequestController: AbortController | null = null;
let valuationRequestController: AbortController | null = null;

const items = computed(() => market.value?.items ?? []);
const selectedQuote = computed(
  () => detail.value?.quote ?? items.value.find((item) => item.key === selectedKey.value) ?? null
);
const isFavorite = computed(() => favorites.value.some((item) => item.key === selectedKey.value));
const groups = computed(() => {
  const map = new Map<string, IndexQuote[]>();
  for (const item of items.value) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return [...map.entries()];
});

watch([query, marketFilter], () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void loadMarket(), 250);
});

onMounted(async () => {
  window.addEventListener('popstate', pop);
  await Promise.all([
    loadFavorites(),
    loadMarket(),
    loadDetail(selectedKey.value),
    loadValuation(selectedKey.value)
  ]);
});

onUnmounted(() => {
  window.clearTimeout(timer);
  window.removeEventListener('popstate', pop);
  marketRequestController?.abort();
  detailRequestController?.abort();
  valuationRequestController?.abort();
});

async function loadMarket(refresh = false): Promise<void> {
  marketRequestController?.abort();
  const requestController = new AbortController();
  marketRequestController = requestController;
  marketLoading.value = true;
  error.value = null;
  try {
    market.value = await getIndices({
      q: query.value,
      market: marketFilter.value,
      refresh,
      signal: requestController.signal
    });
  } catch (caught) {
    if (!isRequestAbort(caught)) {
      error.value = caught instanceof Error ? caught.message : '指数行情读取失败';
    }
  } finally {
    if (marketRequestController === requestController) {
      marketRequestController = null;
      marketLoading.value = false;
    }
  }
}

async function loadDetail(key: string, refresh = false): Promise<void> {
  detailRequestController?.abort();
  const requestController = new AbortController();
  detailRequestController = requestController;
  const [marketName, symbol] = key.split(':') as [IndexMarket, string];
  detailLoading.value = true;
  error.value = null;
  detail.value = null;
  try {
    detail.value = await getIndexDetail(marketName, symbol, 10, refresh, requestController.signal);
  } catch (caught) {
    if (detailRequestController === requestController && !isRequestAbort(caught)) {
      detail.value = null;
      error.value = caught instanceof Error ? caught.message : '指数详情读取失败';
    }
  } finally {
    if (detailRequestController === requestController) {
      detailRequestController = null;
      detailLoading.value = false;
    }
  }
}

async function loadValuation(key: string, refresh = false): Promise<void> {
  valuationRequestController?.abort();
  const requestController = new AbortController();
  valuationRequestController = requestController;
  const [marketName, symbol] = key.split(':') as [IndexMarket, string];
  valuationLoading.value = true;
  valuationError.value = null;
  valuation.value = null;
  try {
    valuation.value = await getIndexValuation(marketName, symbol, refresh, requestController.signal);
  } catch (caught) {
    if (valuationRequestController === requestController && !isRequestAbort(caught)) {
      valuationError.value = caught instanceof Error ? caught.message : '指数估值读取失败';
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
    favorites.value = await getFavoriteIndices();
  } catch {
    favorites.value = [];
  }
}

function select(item: IndexQuote, mode: 'push' | 'none' = 'push'): void {
  selectedKey.value = item.key;
  if (mode === 'push') sync(item.key);
  window.scrollTo({ top: 0, behavior: 'auto' });
  void loadDetail(item.key);
  void loadValuation(item.key);
}

async function refresh(): Promise<void> {
  await Promise.all([
    loadMarket(true),
    loadDetail(selectedKey.value, true),
    loadValuation(selectedKey.value, true)
  ]);
}

async function toggleFavorite(): Promise<void> {
  const quote = selectedQuote.value;
  if (!quote || favoriteLoading.value) return;
  favoriteLoading.value = true;
  try {
    favorites.value = isFavorite.value
      ? await removeFavoriteIndex(quote.market, quote.symbol)
      : await saveFavoriteIndex(quote.market, quote.symbol);
  } finally {
    favoriteLoading.value = false;
  }
}

function sync(key: string): void {
  const params = new URLSearchParams(location.search);
  params.set('view', 'index');
  params.set('index', key);
  params.delete('etf');
  history.pushState({ view: 'index', index: key }, '', `${location.pathname}?${params}`);
}

function pop(): void {
  const key = keyFromUrl();
  if (key === selectedKey.value) return;
  selectedKey.value = key;
  void loadDetail(key);
  void loadValuation(key);
}

function keyFromUrl(): string {
  const value = new URLSearchParams(location.search).get('index') ?? 'cn:000300';
  return /^(cn|bj|hk):[A-Z0-9]+$/i.test(value) ? value : 'cn:000300';
}

function number(value: number | null, digits = 2): string {
  return value === null
    ? '-'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
}

function compact(value: number | null): string {
  if (value === null) return '-';
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return number(value);
}

function percent(value: number | null, decimal = false): string {
  if (value === null) return '-';
  const normalized = decimal ? value * 100 : value;
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(2)}%`;
}

function marketName(value: IndexMarket): string {
  return value === 'hk' ? '港股指数' : value === 'bj' ? '北交所指数' : 'A股指数';
}

function date(value: string | null): string {
  return value
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '-';
}
</script>
<template><section class="index-page"><header class="etf-page-toolbar"><div><h1>指数研究</h1><span>{{items.length}} 个常用指数</span></div><div class="etf-search-control"><Search :size="18"/><input v-model="query" type="search" placeholder="搜索指数名称或代码" aria-label="搜索指数"/><Loader2 v-if="marketLoading" class="spin-icon" :size="16"/></div><button class="ghost-button blue" type="button" :disabled="marketLoading||detailLoading" @click="refresh"><Loader2 v-if="marketLoading||detailLoading" class="spin-icon" :size="16"/><RefreshCw v-else :size="16"/>刷新</button></header>
<div v-if="error" class="status-banner">{{error}}</div>
<section class="index-snapshot-strip" aria-label="常用指数行情"><button v-for="item in (market?.items??[]).slice(0,8)" :key="item.key" type="button" :class="{active:item.key===selectedKey}" @click="select(item)"><span>{{item.name}}</span><strong>{{number(item.latestPrice)}}</strong><em :class="{up:(item.changePercent??0)>=0,down:(item.changePercent??0)<0}">{{percent(item.changePercent)}}</em></button></section>
<section v-if="selectedQuote" class="etf-quote-band index-quote-band"><div class="etf-identity"><span>{{marketName(selectedQuote.market)}}</span><h2>{{selectedQuote.name}}</h2><strong>{{selectedQuote.displaySymbol}}</strong></div><div class="etf-live-price"><strong>{{number(selectedQuote.latestPrice)}}</strong><span :class="{up:(selectedQuote.changePercent??0)>=0,down:(selectedQuote.changePercent??0)<0}">{{percent(selectedQuote.changePercent)}} · {{number(selectedQuote.changeAmount)}}</span></div><dl class="etf-quote-facts"><div><dt>今开</dt><dd>{{number(selectedQuote.open)}}</dd></div><div><dt>最高</dt><dd>{{number(selectedQuote.high)}}</dd></div><div><dt>最低</dt><dd>{{number(selectedQuote.low)}}</dd></div><div><dt>昨收</dt><dd>{{number(selectedQuote.previousClose)}}</dd></div><div><dt>成交额</dt><dd>{{compact(selectedQuote.amount)}}</dd></div><div><dt>成交量</dt><dd>{{compact(selectedQuote.volume)}}</dd></div></dl><div class="etf-quote-actions"><button class="ghost-button" :class="{'favorite-active':isFavorite}" :disabled="favoriteLoading" @click="toggleFavorite"><Star :size="16"/>{{isFavorite?'已收藏':'收藏'}}</button><small>{{market?.cache.stale?'陈旧缓存':market?.cache.hit?'本地缓存':'刚刚更新'}} · {{date(market?.refreshedAt??null)}}</small></div></section>
<div v-if="detailLoading&&!detail" class="loading-panel"><Loader2 class="spin-icon" :size="18"/>正在读取指数历史行情...</div>
<div v-if="detail" class="index-workspace"><aside class="index-directory"><header><div><span>指数目录</span><h2>常用指数</h2></div><div class="etf-exchange-tabs"><button :class="{active:marketFilter==='all'}" @click="marketFilter='all'">全部</button><button :class="{active:marketFilter==='cn'}" @click="marketFilter='cn'">A股</button><button :class="{active:marketFilter==='hk'}" @click="marketFilter='hk'">港股</button></div></header><div v-for="[name,list] in groups" :key="name" class="index-directory-group"><h3>{{name}}</h3><button v-for="item in list" :key="item.key" type="button" :class="{active:item.key===selectedKey}" @click="select(item)"><span><strong>{{item.name}}</strong><small>{{item.displaySymbol}}</small></span><em :class="{up:(item.changePercent??0)>=0,down:(item.changePercent??0)<0}">{{percent(item.changePercent)}}</em></button></div></aside>
<main><div class="index-analysis-grid"><IndexHistoryChart :history="detail.history" :symbol="detail.quote.displaySymbol"/><section class="etf-risk-panel"><header><div><span>估值与风险</span><h2>区间分析</h2></div><small>{{detail.metrics.tradingDays}} 个交易日</small></header><div class="index-valuation-card" :class="{unavailable:valuation&&!valuation.available}"><div><span>指数市盈率</span><strong v-if="valuation?.available">{{number(valuation.peTotalShares)}}<small>倍</small></strong><strong v-else-if="valuationLoading"><Loader2 class="spin-icon" :size="18"/></strong><strong v-else>-</strong></div><dl v-if="valuation?.available"><div><dt>口径</dt><dd>总股本 PE1</dd></div><div><dt>计算用股本 PE2</dt><dd>{{number(valuation.peCalculatedShares)}} 倍</dd></div><div><dt>估值日期</dt><dd>{{valuation.valuationDate??'-'}}</dd></div></dl><p v-else-if="valuation">{{valuation.unavailableReason}}</p><p v-else-if="valuationError">{{valuationError}}</p></div><p class="index-metric-note">市盈率来自中证官方估值；收益与风险基于未复权指数日线计算。</p><div class="etf-risk-grid"><div><span>20日收益</span><strong :class="{up:(detail.metrics.return20d??0)>=0,down:(detail.metrics.return20d??0)<0}">{{percent(detail.metrics.return20d,true)}}</strong></div><div><span>60日收益</span><strong :class="{up:(detail.metrics.return60d??0)>=0,down:(detail.metrics.return60d??0)<0}">{{percent(detail.metrics.return60d,true)}}</strong></div><div><span>今年以来</span><strong>{{percent(detail.metrics.returnYtd,true)}}</strong></div><div><span>年化收益</span><strong>{{percent(detail.metrics.annualizedReturn,true)}}</strong></div><div><span>年化波动</span><strong>{{percent(detail.metrics.annualizedVolatility,true)}}</strong></div><div><span>最大回撤</span><strong class="down">{{percent(detail.metrics.maxDrawdown,true)}}</strong></div><div><span>当前回撤</span><strong class="down">{{percent(detail.metrics.currentDrawdown,true)}}</strong></div><div><span>区间最高</span><strong>{{number(detail.metrics.periodHigh)}}</strong></div><div><span>区间最低</span><strong>{{number(detail.metrics.periodLow)}}</strong></div></div></section></div></main></div></section></template>
