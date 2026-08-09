<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { RefreshCw } from 'lucide-vue-next';
import type { CompanySearchResult, PeerComparison, PeerMetricComparison } from '../types/finance';
import { getMetricComparison } from '../services/api';
import { isAbortError } from '../app/app-formatters';
import {
  formatPeerMetricValue,
  latestPeerMetricSnapshot,
  peerMetricGroups,
  peerMetricOption,
  peerMetricOptions,
  type PeerMetricGroupKey
} from '../finance/peer-metrics';

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

const props = defineProps<{
  company: CompanySearchResult | null;
  peers: PeerComparison | null;
}>();

const activeGroup = ref<PeerMetricGroupKey>('profitability');
const activeMetricKey = ref('netMargin');
const loading = ref(false);
const error = ref<string | null>(null);
const metricComparison = ref<PeerMetricComparison | null>(null);
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);
let requestController: AbortController | null = null;

const visibleOptions = computed(() => peerMetricOptions.filter((option) => option.group === activeGroup.value));
const activeOption = computed(() => peerMetricOption(activeMetricKey.value));
const peerKey = computed(() => (props.peers?.peers ?? [])
  .slice(0, 12)
  .map((company) => `${company.market}:${company.symbol}`)
  .join(','));
const snapshot = computed(() => latestPeerMetricSnapshot(
  metricComparison.value,
  props.company?.market,
  props.company?.symbol
));

watch(activeGroup, () => {
  if (visibleOptions.value.some((option) => option.key === activeMetricKey.value)) return;
  activeMetricKey.value = visibleOptions.value[0]?.key ?? 'netMargin';
});

watch(
  () => `${props.company?.market ?? ''}:${props.company?.symbol ?? ''}:${activeMetricKey.value}:${peerKey.value}`,
  () => void loadMetricComparison(),
  { immediate: true }
);

async function loadMetricComparison(): Promise<void> {
  requestController?.abort();
  const companies = (props.peers?.peers ?? []).slice(0, 12);
  if (!companies.length) {
    metricComparison.value = null;
    loading.value = false;
    error.value = null;
    return;
  }

  const controller = new AbortController();
  requestController = controller;
  loading.value = true;
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

const chartOption = computed<EChartsCoreOption>(() => {
  const comparison = metricComparison.value;
  const years = comparison?.years ?? [];
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
  chart.value?.setOption(option, true);
});

onMounted(async () => {
  await nextTick();
  if (chartElement.value) {
    chart.value = echarts.init(chartElement.value);
    chart.value.setOption(chartOption.value, true);
  }
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
        <span>财务横向对比</span>
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
        :aria-label="`${activeOption.label}同行年度趋势图`"
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
