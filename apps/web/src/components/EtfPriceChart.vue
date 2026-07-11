<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { AxisPointerComponent, DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { BarChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { EtfHistoryPoint } from '../types/etf';

echarts.use([AxisPointerComponent, DataZoomComponent, GridComponent, TooltipComponent, BarChart, LineChart, CanvasRenderer]);

type ChartRange = '1m' | '3m' | '1y' | '3y' | 'all';

const props = defineProps<{
  history: EtfHistoryPoint[];
  symbol: string;
}>();

const ranges: Array<{ value: ChartRange; label: string; days: number | null }> = [
  { value: '1m', label: '1月', days: 31 },
  { value: '3m', label: '3月', days: 93 },
  { value: '1y', label: '1年', days: 366 },
  { value: '3y', label: '3年', days: 1098 },
  { value: 'all', label: '全部', days: null }
];

const activeRange = ref<ChartRange>('1y');
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const visibleHistory = computed(() => {
  const range = ranges.find((item) => item.value === activeRange.value);
  if (!range?.days || !props.history.length) return props.history;
  const latestDate = new Date(props.history[props.history.length - 1].date);
  const threshold = new Date(latestDate);
  threshold.setDate(threshold.getDate() - range.days);
  return props.history.filter((point) => new Date(point.date).getTime() >= threshold.getTime());
});
const usesAmount = computed(() => visibleHistory.value.some((point) => point.amount !== null));

const chartOption = computed<EChartsCoreOption>(() => ({
  animationDuration: 260,
  axisPointer: { link: [{ xAxisIndex: 'all' }] },
  tooltip: {
    trigger: 'axis',
    confine: true,
    formatter: (params: unknown) => formatTooltip(params)
  },
  grid: [
    { left: 58, right: 20, top: 24, height: '61%' },
    { left: 58, right: 20, top: '76%', height: '15%' }
  ],
  xAxis: [
    {
      type: 'category',
      data: visibleHistory.value.map((point) => point.date),
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11, hideOverlap: true }
    },
    {
      type: 'category',
      gridIndex: 1,
      data: visibleHistory.value.map((point) => point.date),
      boundaryGap: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false }
    }
  ],
  yAxis: [
    {
      type: 'value',
      scale: true,
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (value: number) => formatPrice(value) },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    {
      type: 'value',
      gridIndex: 1,
      axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (value: number) => compactNumber(value) },
      splitLine: { show: false }
    }
  ],
  dataZoom: [
    { type: 'inside', xAxisIndex: [0, 1], filterMode: 'none' }
  ],
  series: [
    {
      name: '收盘价',
      type: 'line',
      data: visibleHistory.value.map((point) => point.close),
      showSymbol: visibleHistory.value.length <= 40,
      symbolSize: 5,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2.5, color: '#2563eb' },
      itemStyle: { color: '#2563eb', borderColor: '#fff', borderWidth: 1 },
      areaStyle: { color: 'rgba(37, 99, 235, 0.08)' }
    },
    {
      type: 'bar',
      xAxisIndex: 1,
      yAxisIndex: 1,
      name: usesAmount.value ? '成交额' : '成交量',
      data: visibleHistory.value.map((point) => usesAmount.value ? point.amount : point.volume),
      itemStyle: { color: 'rgba(100, 116, 139, 0.42)' },
      barMaxWidth: 8
    }
  ]
}));

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

function ensureChart(): void {
  if (!chart.value && chartElement.value) chart.value = echarts.init(chartElement.value);
}

function resizeChart(): void {
  chart.value?.resize();
}

function formatPrice(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 4 }).format(value);
}

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(0)}万`;
  return value.toFixed(0);
}

function formatTooltip(params: unknown): string {
  const entries = Array.isArray(params) ? params : [params];
  const entry = entries[0] as { dataIndex?: number; axisValue?: string } | undefined;
  const point = typeof entry?.dataIndex === 'number' ? visibleHistory.value[entry.dataIndex] : undefined;
  if (!point) return '';
  const activity = usesAmount.value ? point.amount : point.volume;
  return `<div class="etf-chart-tooltip"><strong>${point.date}</strong><dl>
    <dt>收盘</dt><dd>${formatPrice(point.close)}</dd>
    <dt>涨跌幅</dt><dd class="${(point.changePercent ?? 0) >= 0 ? 'up' : 'down'}">${formatPercent(point.changePercent)}</dd>
    <dt>最高 / 最低</dt><dd>${formatPrice(point.high)} / ${formatPrice(point.low)}</dd>
    <dt>${usesAmount.value ? '成交额' : '成交量'}</dt><dd>${activity === null ? '-' : compactNumber(activity)}</dd>
  </dl></div>`;
}

function formatPercent(value: number | null): string {
  if (value === null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
</script>

<template>
  <section class="etf-price-panel">
    <header>
      <div>
        <span>历史行情</span>
        <h2>价格与成交</h2>
      </div>
      <div class="etf-range-switch" aria-label="历史行情范围">
        <button
          v-for="range in ranges"
          :key="range.value"
          type="button"
          :class="{ active: activeRange === range.value }"
          @click="activeRange = range.value"
        >
          {{ range.label }}
        </button>
      </div>
    </header>
    <div ref="chartElement" class="etf-price-chart" role="img" :aria-label="`${symbol} ETF 历史价格与成交额`"></div>
  </section>
</template>
