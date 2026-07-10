<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { CacheEntry, PeerMetricComparison } from '../types/finance';

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

const props = defineProps<{
  comparison: PeerMetricComparison | null;
  loading: boolean;
  error: string | null;
  metricKey: string;
  mode: 'peers' | 'custom';
  cacheEntries: CacheEntry[];
  selectedCompanyKeys: string[];
}>();

const emit = defineEmits<{
  (event: 'metric-change', value: string): void;
  (event: 'mode-change', value: 'peers' | 'custom'): void;
  (event: 'selection-change', value: string[]): void;
}>();

const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const metricOptions = [
  { key: 'revenue', label: '营业收入' },
  { key: 'netProfit', label: '净利润' },
  { key: 'assets', label: '总资产' },
  { key: 'liabilities', label: '总负债' },
  { key: 'operatingCashflow', label: '经营现金流' }
];

const cachedStatementEntries = computed(() =>
  props.cacheEntries
    .filter((entry) => entry.kind === 'statements')
    .slice(0, 24)
);

const chartOption = computed<EChartsCoreOption>(() => {
  const comparison = props.comparison;
  if (!comparison || !comparison.companies.length) {
    return { series: [] };
  }

  return {
    color: ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2'],
    legend: {
      top: 0,
      type: 'scroll',
      textStyle: { color: '#475569', fontSize: 11 }
    },
    grid: { top: 42, right: 18, bottom: 28, left: 58 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      valueFormatter: (value: unknown) => formatNumber(typeof value === 'number' ? value : null)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: comparison.years,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => compactNumber(value)
      },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: comparison.companies.map((company) => ({
      name: company.name,
      type: 'line',
      smooth: true,
      symbolSize: company.isSelected ? 8 : 5,
      lineStyle: { width: company.isSelected ? 3 : 2 },
      data: company.points.map((point) => point.value)
    }))
  };
});

watch(chartOption, async (option) => {
  await nextTick();
  ensureChart();
  chart.value?.setOption(option, true);
});

onMounted(async () => {
  await nextTick();
  ensureChart();
  chart.value?.setOption(chartOption.value, true);
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  chart.value?.dispose();
});

function resizeChart(): void {
  chart.value?.resize();
}

function ensureChart(): void {
  if (!chart.value && chartElement.value) {
    chart.value = echarts.init(chartElement.value);
  }
}

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(0)}万`;
  return value.toFixed(0);
}

function formatNumber(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function companyKey(entry: CacheEntry): string {
  return `${entry.market}:${entry.symbol}`;
}

function toggleCompany(entry: CacheEntry): void {
  const key = companyKey(entry);
  const selected = new Set(props.selectedCompanyKeys);
  if (selected.has(key)) {
    selected.delete(key);
  } else {
    selected.add(key);
  }
  emit('selection-change', [...selected]);
}
</script>

<template>
  <section class="peer-metric-panel">
    <div class="peer-metric-head">
      <div>
        <span>同行财务指标</span>
        <h3>{{ comparison?.metricLabel ?? '本地缓存对比' }}</h3>
      </div>
      <select :value="metricKey" @change="emit('metric-change', ($event.target as HTMLSelectElement).value)">
        <option v-for="option in metricOptions" :key="option.key" :value="option.key">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div class="peer-metric-mode-tabs" aria-label="对比范围">
      <button
        :class="{ active: mode === 'peers' }"
        type="button"
        @click="emit('mode-change', 'peers')"
      >
        拉取到的同行
      </button>
      <button
        :class="{ active: mode === 'custom' }"
        type="button"
        @click="emit('mode-change', 'custom')"
      >
        自选本地公司
      </button>
    </div>

    <div v-if="mode === 'custom'" class="peer-metric-company-picker" aria-label="已缓存财报公司">
      <button
        v-for="entry in cachedStatementEntries"
        :key="companyKey(entry)"
        :class="{ active: selectedCompanyKeys.includes(companyKey(entry)) }"
        type="button"
        @click="toggleCompany(entry)"
      >
        <span>{{ entry.name ?? entry.displaySymbol }}</span>
        <small>{{ entry.displaySymbol }}</small>
      </button>
    </div>

    <div v-if="loading" class="peer-state">正在读取本地同行财务缓存...</div>
    <div v-else-if="error" class="peer-state error">{{ error }}</div>
    <div v-else-if="!comparison || !comparison.companies.length" class="peer-state">
      暂无可对比的同行财务缓存。进入同行公司页面拉取一次财报后，这里会自动加入对比。
    </div>

    <div ref="chartElement" class="peer-metric-chart" role="img" :aria-label="`${comparison?.metricLabel ?? '同行指标'} 同行对比`"></div>
    <div v-if="comparison?.companies.length && comparison.missingCompanies.length" class="peer-metric-note">
      {{ comparison.missingCompanies.length }} 家同行还没有本地财报缓存，未纳入图表。
    </div>
  </section>
</template>
