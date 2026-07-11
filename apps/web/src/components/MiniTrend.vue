<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { MetricSeries } from '../types/finance';

echarts.use([
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LineChart,
  CanvasRenderer
]);

type TrendViewMode = 'index' | 'amount';

interface TooltipEntry {
  axisValue?: string | number;
  color?: string;
  seriesName?: string;
  value?: unknown;
}

const props = defineProps<{
  series: MetricSeries[];
}>();

const colors = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];
const viewMode = ref<TrendViewMode>('index');
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const visibleSeries = computed(() => props.series.slice(0, 5));
const years = computed(() => {
  const values = new Set<string>();
  visibleSeries.value.forEach((line) => line.points.forEach((point) => values.add(point.year)));
  return [...values].sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
});
const hasData = computed(() =>
  visibleSeries.value.some((line) => line.points.some((point) => point.value !== null))
);
const yearRange = computed(() => {
  if (!years.value.length) return '暂无年度数据';
  if (years.value.length === 1) return `${years.value[0]} 年`;
  return `${years.value[0]} - ${years.value[years.value.length - 1]}`;
});
const amountUnit = computed(() => {
  const values = visibleSeries.value.flatMap((line) =>
    line.points.map((point) => Math.abs(point.value ?? 0))
  );
  const maximum = Math.max(0, ...values);
  if (maximum >= 100_000_000) return { divisor: 100_000_000, label: '亿' };
  if (maximum >= 10_000) return { divisor: 10_000, label: '万' };
  return { divisor: 1, label: '原始单位' };
});

const chartOption = computed<EChartsCoreOption>(() => {
  const isIndex = viewMode.value === 'index';

  return {
    animationDuration: 300,
    color: colors,
    legend: {
      type: 'scroll',
      top: 2,
      left: 0,
      right: 0,
      itemWidth: 18,
      itemHeight: 8,
      textStyle: { color: '#475569', fontSize: 11 }
    },
    grid: { top: 46, right: 18, bottom: 30, left: isIndex ? 54 : 66 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line', lineStyle: { color: '#94a3b8', type: 'dashed' } },
      formatter: (params: unknown) => formatTooltip(params)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: years.value,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      name: isIndex ? '基期=100' : amountUnit.value.label,
      nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 0, 8] },
      scale: true,
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatAxisValue(value)
      },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: visibleSeries.value.map((line, index) => ({
      name: line.label,
      type: 'line',
      data: years.value.map((year) => displayValue(line, year)),
      connectNulls: false,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 6,
      smooth: false,
      lineStyle: { width: index === 0 ? 3 : 2.25 },
      itemStyle: { borderColor: '#ffffff', borderWidth: 1.5 },
      emphasis: { focus: 'series', lineStyle: { width: 4 } }
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

function ensureChart(): void {
  if (!chart.value && chartElement.value) {
    chart.value = echarts.init(chartElement.value);
  }
}

function resizeChart(): void {
  chart.value?.resize();
}

function rawValue(line: MetricSeries, year: string): number | null {
  return line.points.find((point) => point.year === year)?.value ?? null;
}

function baselineValue(line: MetricSeries): number | null {
  for (const year of years.value) {
    const value = rawValue(line, year);
    if (value !== null && value !== 0) return value;
  }
  return null;
}

function displayValue(line: MetricSeries, year: string): number | null {
  const value = rawValue(line, year);
  if (value === null) return null;
  if (viewMode.value === 'amount') return value / amountUnit.value.divisor;
  const baseline = baselineValue(line);
  return baseline === null ? null : (value / baseline) * 100;
}

function previousValue(line: MetricSeries, year: string): number | null {
  const index = years.value.indexOf(year);
  return index > 0 ? rawValue(line, years.value[index - 1]) : null;
}

function yoyValue(line: MetricSeries, year: string): number | null {
  const current = rawValue(line, year);
  const previous = previousValue(line, year);
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatAxisValue(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
}

function formatAmount(value: number | null): string {
  if (value === null) return '-';
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${formatNumber(value / 100_000_000)} 亿`;
  if (absolute >= 10_000) return `${formatNumber(value / 10_000)} 万`;
  return formatNumber(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: Math.abs(value) >= 1 ? 2 : 4
  }).format(value);
}

function formatTooltip(params: unknown): string {
  const entries = (Array.isArray(params) ? params : [params]) as TooltipEntry[];
  const year = String(entries[0]?.axisValue ?? '');
  const rows = entries
    .map((entry) => {
      const line = visibleSeries.value.find((candidate) => candidate.label === entry.seriesName);
      if (!line) return '';
      const actual = rawValue(line, year);
      const yoy = yoyValue(line, year);
      const indexValue = displayIndexValue(line, year);
      const tone = yoy === null ? '#94a3b8' : yoy >= 0 ? '#dc2626' : '#059669';
      return `<div class="mini-trend-tooltip-row">
        <span><i style="background:${escapeHtml(String(entry.color ?? '#64748b'))}"></i>${escapeHtml(line.label)}</span>
        <b>${formatAmount(actual)}</b>
        <em style="color:${tone}">${yoy === null ? '-' : `${yoy >= 0 ? '+' : ''}${yoy.toFixed(2)}%`}</em>
        <small>${indexValue === null ? '-' : indexValue.toFixed(1)}</small>
      </div>`;
    })
    .join('');

  return `<div class="mini-trend-tooltip">
    <strong>${escapeHtml(year)} 年</strong>
    <div class="mini-trend-tooltip-head"><span>指标</span><span>实际金额</span><span>同比</span><span>指数</span></div>
    ${rows}
  </div>`;
}

function displayIndexValue(line: MetricSeries, year: string): number | null {
  const value = rawValue(line, year);
  const baseline = baselineValue(line);
  return value === null || baseline === null ? null : (value / baseline) * 100;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return entities[character] ?? character;
  });
}
</script>

<template>
  <section class="trend-panel">
    <div class="panel-title trend-panel-title">
      <div>
        <p class="section-label">关键指标趋势</p>
        <h3>核心财务趋势</h3>
        <small>{{ yearRange }}</small>
      </div>
      <div class="trend-mode-switch" aria-label="趋势图视图">
        <button
          type="button"
          :class="{ active: viewMode === 'index' }"
          @click="viewMode = 'index'"
        >
          增长指数
        </button>
        <button
          type="button"
          :class="{ active: viewMode === 'amount' }"
          @click="viewMode = 'amount'"
        >
          实际金额
        </button>
      </div>
    </div>

    <div
      v-if="hasData"
      ref="chartElement"
      class="trend-chart"
      role="img"
      :aria-label="`核心财务趋势，${yearRange}，${viewMode === 'index' ? '增长指数' : '实际金额'}视图`"
    ></div>
    <div v-else class="trend-chart-empty">暂无可绘制的核心财务指标</div>
  </section>
</template>
