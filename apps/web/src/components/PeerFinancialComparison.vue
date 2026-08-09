<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { Check, RefreshCw, Search } from 'lucide-vue-next';
import type { CacheEntry, CompanySearchResult, PeerComparison, PeerMetricComparison } from '../types/finance';
import { getCacheEntries, getMetricComparison } from '../services/api';
import { isAbortError } from '../app/app-formatters';
import {
  formatPeerMetricValue,
  latestPeerMetricSnapshot,
  peerMetricGroups,
  peerMetricOption,
  peerMetricOptions,
  type PeerMetricGroupKey
} from '../finance/peer-metrics';
import {
  loadPeerBasket,
  peerCompanyKey,
  peerPreferenceStorage,
  sanitizePeerBasketKeys,
  savePeerBasket
} from '../finance/peer-preferences';

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

const props = defineProps<{
  company: CompanySearchResult | null;
  peers: PeerComparison | null;
}>();

const activeGroup = ref<PeerMetricGroupKey>('profitability');
const activeMetricKey = ref('netMargin');
const comparisonMode = ref<'industry' | 'custom'>('industry');
const chartRange = ref<'5' | 'all'>('5');
const selectedYear = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const metricComparison = ref<PeerMetricComparison | null>(null);
const cacheEntries = ref<CacheEntry[]>([]);
const cacheLoading = ref(false);
const cacheError = ref<string | null>(null);
const companySearch = ref('');
const selectedCompanyKeys = ref<string[]>([]);
const basketNotice = ref<string | null>(null);
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);
let requestController: AbortController | null = null;

const visibleOptions = computed(() => peerMetricOptions.filter((option) => option.group === activeGroup.value));
const activeOption = computed(() => peerMetricOption(activeMetricKey.value));
const statementEntries = computed(() => cacheEntries.value.filter((entry) => entry.kind === 'statements'));
const requiredCompanyKey = computed(() => props.company ? peerCompanyKey(props.company) : '');
const customCompanies = computed(() => {
  const selected = new Set(selectedCompanyKeys.value);
  return statementEntries.value
    .filter((entry) => selected.has(peerCompanyKey(entry)))
    .map((entry) => ({
      market: entry.market,
      symbol: entry.symbol,
      name: entry.name ?? entry.displaySymbol
    }));
});
const comparisonCompanies = computed(() => comparisonMode.value === 'custom'
  ? customCompanies.value
  : (props.peers?.peers ?? []).slice(0, 12));
const peerKey = computed(() => comparisonCompanies.value
  .map((company) => `${company.market}:${company.symbol}`)
  .join(','));
const filteredEntries = computed(() => {
  const keyword = companySearch.value.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return statementEntries.value;
  return statementEntries.value.filter((entry) => (
    `${entry.name ?? ''} ${entry.symbol} ${entry.displaySymbol} ${entry.market}`
      .toLocaleLowerCase('zh-CN')
      .includes(keyword)
  ));
});
const snapshot = computed(() => latestPeerMetricSnapshot(
  metricComparison.value,
  props.company?.market,
  props.company?.symbol,
  selectedYear.value || undefined
));
const displayYears = computed(() => {
  const years = metricComparison.value?.years ?? [];
  return chartRange.value === '5' ? years.slice(-5) : years;
});

watch(activeGroup, () => {
  if (visibleOptions.value.some((option) => option.key === activeMetricKey.value)) return;
  activeMetricKey.value = visibleOptions.value[0]?.key ?? 'netMargin';
});

watch(
  () => `${props.company?.market ?? ''}:${props.company?.symbol ?? ''}:${comparisonMode.value}:${activeMetricKey.value}:${peerKey.value}`,
  () => void loadMetricComparison(),
  { immediate: true }
);

watch(
  () => metricComparison.value?.years.join(',') ?? '',
  () => {
    const years = metricComparison.value?.years ?? [];
    if (!years.includes(selectedYear.value)) selectedYear.value = years.at(-1) ?? '';
  },
  { immediate: true }
);

watch(requiredCompanyKey, () => restoreBasketSelection());

async function loadMetricComparison(): Promise<void> {
  requestController?.abort();
  const companies = comparisonCompanies.value;
  if (!companies.length) {
    metricComparison.value = null;
    loading.value = false;
    error.value = null;
    return;
  }

  const controller = new AbortController();
  requestController = controller;
  loading.value = true;
  chart.value?.dispose();
  chart.value = null;
  metricComparison.value = null;
  error.value = null;
  try {
    const payload = await getMetricComparison(
      activeMetricKey.value,
      companies.map((company) => ({
        market: company.market,
        symbol: company.symbol,
        name: company.name
      })),
      controller.signal
    );
    if (!controller.signal.aborted) metricComparison.value = payload;
  } catch (requestError) {
    if (!isAbortError(requestError)) {
      metricComparison.value = null;
      error.value = requestError instanceof Error ? requestError.message : '同行财务指标读取失败';
    }
  } finally {
    if (requestController === controller) {
      requestController = null;
      loading.value = false;
    }
  }
}

async function loadCachedCompanies(): Promise<void> {
  cacheLoading.value = true;
  cacheError.value = null;
  try {
    cacheEntries.value = await getCacheEntries();
    restoreBasketSelection();
  } catch (requestError) {
    cacheError.value = requestError instanceof Error ? requestError.message : '本地公司列表读取失败';
  } finally {
    cacheLoading.value = false;
  }
}

function restoreBasketSelection(): void {
  if (!statementEntries.value.length) return;
  const storage = peerPreferenceStorage();
  const saved = loadPeerBasket(storage);
  const defaults = [requiredCompanyKey.value, ...statementEntries.value.slice(0, 4).map(peerCompanyKey)].filter(Boolean);
  selectedCompanyKeys.value = sanitizePeerBasketKeys(
    saved.length ? saved : defaults,
    statementEntries.value,
    requiredCompanyKey.value,
    8
  );
  savePeerBasket(storage, selectedCompanyKeys.value);
}

function toggleBasketCompany(entry: CacheEntry): void {
  const key = peerCompanyKey(entry);
  if (key === requiredCompanyKey.value) return;
  basketNotice.value = null;
  if (selectedCompanyKeys.value.includes(key)) {
    selectedCompanyKeys.value = selectedCompanyKeys.value.filter((item) => item !== key);
  } else if (selectedCompanyKeys.value.length >= 8) {
    basketNotice.value = '最多选择 8 家公司，请先移除一家公司。';
    return;
  } else {
    selectedCompanyKeys.value = [...selectedCompanyKeys.value, key];
  }
  savePeerBasket(peerPreferenceStorage(), selectedCompanyKeys.value);
}

function isBasketSelected(entry: CacheEntry): boolean {
  return selectedCompanyKeys.value.includes(peerCompanyKey(entry));
}

const chartOption = computed<EChartsCoreOption>(() => {
  const comparison = metricComparison.value;
  const years = displayYears.value;
  const kind = activeOption.value.kind;
  return {
    animationDuration: 260,
    grid: { top: 62, right: 22, bottom: 32, left: 62 },
    legend: {
      type: 'scroll',
      top: 8,
      left: 8,
      right: 8,
      textStyle: { color: '#64748b', fontSize: 11 }
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params: unknown) => formatTooltip(params, kind)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: years,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatPeerMetricValue(value, kind)
      },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: (comparison?.companies ?? []).map((series) => {
      const selected = series.market === props.company?.market && series.symbol === props.company?.symbol;
      return {
        name: series.name,
        type: 'line',
        smooth: false,
        connectNulls: false,
        showSymbol: selected,
        symbolSize: selected ? 7 : 5,
        emphasis: { focus: 'series' },
        lineStyle: { width: selected ? 4 : 1.6, opacity: selected ? 1 : 0.62 },
        z: selected ? 5 : 1,
        data: years.map((year) => series.points.find((point) => point.year === year)?.value ?? null)
      };
    })
  };
});

watch(chartOption, async (option) => {
  await nextTick();
  renderChart(option);
});

onMounted(async () => {
  void loadCachedCompanies();
  await nextTick();
  renderChart(chartOption.value);
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  requestController?.abort();
  window.removeEventListener('resize', resizeChart);
  chart.value?.dispose();
});

function resizeChart(): void {
  chart.value?.resize();
}

function renderChart(option: EChartsCoreOption): void {
  if (!chartElement.value) return;
  if (!chart.value || chart.value.getDom() !== chartElement.value) {
    chart.value?.dispose();
    chart.value = echarts.init(chartElement.value);
  }
  chart.value.setOption(option, true);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTooltip(params: unknown, kind: 'amount' | 'percent'): string {
  if (!Array.isArray(params) || !params.length) return '';
  const year = String((params[0] as { axisValueLabel?: unknown }).axisValueLabel ?? '');
  const rows = params
    .filter((item): item is { marker?: string; seriesName?: string; value?: number | null } => (
      Boolean(item && typeof item === 'object')
    ))
    .filter((item) => typeof item.value === 'number')
    .sort((left, right) => Number(right.value) - Number(left.value))
    .map((item) => `
      <div class="peer-financial-tooltip-row">
        <span>${item.marker ?? ''}${escapeHtml(item.seriesName ?? '')}</span>
        <strong>${escapeHtml(formatPeerMetricValue(item.value, kind))}</strong>
      </div>
    `)
    .join('');
  return `<strong>${escapeHtml(year)}</strong>${rows}`;
}
</script>

<template>
  <section class="peer-financial-panel" aria-labelledby="peer-financial-title">
    <header class="peer-financial-head">
      <div>
        <span>{{ comparisonMode === 'industry' ? '行业同行' : '自选篮子' }} · 财务横向对比</span>
        <h4 id="peer-financial-title">{{ activeOption.label }}</h4>
        <small>{{ activeOption.description }} 数据仅来自本地已缓存财报。</small>
      </div>
      <div v-if="snapshot.year" class="peer-financial-snapshot">
        <span>{{ snapshot.year }} 年</span>
        <strong>{{ formatPeerMetricValue(snapshot.selectedValue, activeOption.kind) }}</strong>
        <small>
          {{ snapshot.selectedRank ? `${snapshot.selectedRank} / ${snapshot.sampleCount}` : '目标公司暂无数据' }}
          · 中位数 {{ formatPeerMetricValue(snapshot.median, activeOption.kind) }}
        </small>
      </div>
    </header>

    <div class="peer-comparison-mode-tabs" aria-label="财务对比范围">
      <button :class="{ active: comparisonMode === 'industry' }" type="button" @click="comparisonMode = 'industry'">
        行业同行
      </button>
      <button :class="{ active: comparisonMode === 'custom' }" type="button" @click="comparisonMode = 'custom'">
        自选篮子 <span>{{ selectedCompanyKeys.length }}</span>
      </button>
      <small>选择会自动保存在当前设备</small>
    </div>

    <div v-if="comparisonMode === 'custom'" class="peer-basket-panel">
      <div class="peer-basket-search">
        <Search :size="15" />
        <input v-model="companySearch" type="search" placeholder="搜索本地公司名称、代码或市场" aria-label="搜索自选对比公司" />
        <strong>{{ selectedCompanyKeys.length }} / 8</strong>
      </div>
      <div v-if="cacheLoading" class="peer-basket-state">正在读取本地公司...</div>
      <div v-else-if="cacheError" class="peer-basket-state error">
        <span>{{ cacheError }}</span>
        <button type="button" @click="loadCachedCompanies">重试</button>
      </div>
      <div v-else-if="!filteredEntries.length" class="peer-basket-state">没有匹配的本地财报公司</div>
      <div v-else class="peer-basket-list">
        <button
          v-for="entry in filteredEntries"
          :key="peerCompanyKey(entry)"
          :class="{ selected: isBasketSelected(entry), locked: peerCompanyKey(entry) === requiredCompanyKey }"
          type="button"
          :aria-pressed="isBasketSelected(entry)"
          :disabled="peerCompanyKey(entry) === requiredCompanyKey"
          @click="toggleBasketCompany(entry)"
        >
          <Check v-if="isBasketSelected(entry)" :size="14" />
          <span>
            <strong>{{ entry.name ?? entry.displaySymbol }}</strong>
            <small>{{ entry.displaySymbol }} · {{ entry.market === 'a' ? 'A股' : '港股' }}</small>
          </span>
          <em v-if="peerCompanyKey(entry) === requiredCompanyKey">当前</em>
        </button>
      </div>
      <p v-if="basketNotice" class="peer-basket-notice">{{ basketNotice }}</p>
    </div>

    <div class="peer-financial-groups" aria-label="同行财务指标分组">
      <button
        v-for="group in peerMetricGroups"
        :key="group.key"
        :class="{ active: activeGroup === group.key }"
        type="button"
        @click="activeGroup = group.key"
      >
        {{ group.label }}
      </button>
    </div>

    <div class="peer-financial-options" aria-label="同行财务指标">
      <button
        v-for="option in visibleOptions"
        :key="option.key"
        :class="{ active: activeMetricKey === option.key }"
        type="button"
        @click="activeMetricKey = option.key"
      >
        {{ option.shortLabel }}
      </button>
    </div>

    <div v-if="metricComparison?.years.length" class="peer-financial-time-tools">
      <label>
        观察年度
        <select v-model="selectedYear">
          <option v-for="year in metricComparison.years.slice().reverse()" :key="year" :value="year">{{ year }} 年</option>
        </select>
      </label>
      <div aria-label="趋势时间范围">
        <button :class="{ active: chartRange === '5' }" type="button" @click="chartRange = '5'">近 5 年</button>
        <button :class="{ active: chartRange === 'all' }" type="button" @click="chartRange = 'all'">全部</button>
      </div>
    </div>

    <div v-if="loading" class="peer-financial-state" role="status">正在读取已缓存的同行财报...</div>
    <div v-else-if="error" class="peer-financial-state error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="loadMetricComparison"><RefreshCw :size="14" />重试</button>
    </div>
    <div
      v-else-if="!metricComparison?.companies.length"
      class="peer-financial-state"
    >
      暂无可比较数据。先查看或刷新几家同行财报后，这里会自动形成横向趋势。
    </div>
    <template v-else>
      <div
        ref="chartElement"
        class="peer-financial-chart"
        role="img"
        :aria-label="`${activeOption.label}${comparisonMode === 'industry' ? '行业同行' : '自选公司'}年度趋势图`"
      ></div>
      <div class="peer-financial-coverage">
        <span>已覆盖 {{ metricComparison.companies.length }} 家</span>
        <small v-if="metricComparison.missingCompanies.length">
          {{ metricComparison.missingCompanies.length }} 家尚无本地财报，未触发批量拉取
        </small>
      </div>
    </template>
  </section>
</template>
