<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { FinancialStatements } from '../types/finance';
import {
  buildStatementComparison,
  STATEMENT_COMPARISON_PRESETS
} from '../finance/statement-comparison';
import type { StatementComparisonPresetKey } from '../finance/statement-comparison';

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

type ValueDisplayUnit = 'raw' | 'wan' | 'yi';

const props = defineProps<{
  statements: FinancialStatements;
  activeYears: string[];
}>();

const activePresetKey = ref<StatementComparisonPresetKey>('profitCash');
const valueUnit = ref<ValueDisplayUnit>('yi');
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const unitOptions: Array<{ value: ValueDisplayUnit; label: string }> = [
  { value: 'raw', label: '原始' },
  { value: 'wan', label: '万' },
  { value: 'yi', label: '亿' }
];

const unitDivisors: Record<ValueDisplayUnit, number> = {
  raw: 1,
  wan: 10_000,
  yi: 100_000_000
};

const seriesColors = ['#2563eb', '#f59e0b', '#16a34a', '#7c3aed'];

const comparison = computed(() => buildStatementComparison(
  props.statements,
  props.activeYears,
  activePresetKey.value
));

const displayYears = computed(() => {
  const years = comparison.value.series[0]?.points.map((point) => point.year) ?? [];
  return years.slice().reverse();
});

const availableSeries = computed(() => comparison.value.series.filter((item) => (
  item.points.some((point) => point.value !== null)
)));

const chartUnitLabel = computed(() => {
  if (valueUnit.value === 'raw') return props.statements.unit || '原始单位';
  return valueUnit.value === 'wan' ? '万' : '亿';
});

const chartOption = computed<EChartsCoreOption>(() => ({
  animationDuration: 300,
  color: seriesColors,
  grid: { top: 62, right: 28, bottom: 36, left: valueUnit.value === 'raw' ? 106 : 84 },
  legend: {
    type: 'scroll',
    top: 12,
    left: 12,
    right: 12,
    textStyle: { color: '#475569', fontSize: 12 }
  },
  tooltip: {
    trigger: 'axis',
    confine: true,
    formatter: (params: unknown) => formatTooltip(params)
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: displayYears.value,
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    axisTick: { show: false },
    axisLabel: { color: '#64748b', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    scale: true,
    name: chartUnitLabel.value,
    nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 0, 8] },
    axisLabel: {
      color: '#64748b',
      fontSize: 11,
      formatter: (value: number) => formatValue(value)
    },
    splitLine: { lineStyle: { color: '#e5e7eb' } }
  },
  series: availableSeries.value.map((item, index) => ({
    name: item.label,
    type: 'line' as const,
    data: displayYears.value.map((year) => {
      const rawValue = item.points.find((point) => point.year === year)?.value ?? null;
      return rawValue === null ? null : rawValue / unitDivisors[valueUnit.value];
    }),
    connectNulls: false,
    showSymbol: true,
    symbolSize: 7,
    smooth: false,
    lineStyle: { width: 2.5, color: seriesColors[index % seriesColors.length] },
    itemStyle: {
      color: seriesColors[index % seriesColors.length],
      borderColor: '#ffffff',
      borderWidth: 2
    }
  }))
}));

watch(chartOption, async (option) => {
  await nextTick();
  ensureChart();
  chart.value?.setOption(option, true);
  chart.value?.resize();
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

function formatValue(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: valueUnit.value === 'raw' || Math.abs(value) >= 1 ? 2 : 4
  }).format(value);
}

function formatTooltip(params: unknown): string {
  const entries = Array.isArray(params) ? params : [params];
  const validEntries = entries.filter((entry): entry is { axisValue?: unknown; seriesName?: unknown; value?: unknown } => (
    Boolean(entry) && typeof entry === 'object'
  ));
  const year = validEntries[0]?.axisValue;
  if (typeof year !== 'string') return '';

  const rows = validEntries.map((entry) => {
    const label = typeof entry.seriesName === 'string' ? entry.seriesName : '-';
    const value = typeof entry.value === 'number' ? entry.value : null;
    return `<div class="statement-trend-tooltip-row"><span>${escapeHtml(label)}</span><b>${formatValue(value)} ${escapeHtml(chartUnitLabel.value)}</b></div>`;
  });
  return [`<strong>${escapeHtml(year)}</strong>`, ...rows].join('');
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
  <section class="statement-comparison-panel" aria-labelledby="statement-comparison-title">
    <div class="statement-comparison-head">
      <div>
        <span>多科目同图</span>
        <h3 id="statement-comparison-title">跨三张表对比</h3>
        <small>选择一组科目，按当前勾选的年份展示</small>
      </div>
      <div class="unit-switch" aria-label="多科目图表数值单位">
        <span>单位</span>
        <button
          v-for="unit in unitOptions"
          :key="unit.value"
          :class="{ active: valueUnit === unit.value }"
          type="button"
          :aria-pressed="valueUnit === unit.value"
          @click="valueUnit = unit.value"
        >
          {{ unit.label }}
        </button>
      </div>
    </div>

    <div class="statement-comparison-options" aria-label="多科目对比组合">
      <button
        v-for="preset in STATEMENT_COMPARISON_PRESETS"
        :key="preset.key"
        :class="{ active: activePresetKey === preset.key }"
        type="button"
        :aria-pressed="activePresetKey === preset.key"
        @click="activePresetKey = preset.key"
      >
        <strong>{{ preset.label }}</strong>
        <span>{{ preset.description }}</span>
      </button>
    </div>

    <div
      v-show="availableSeries.length"
      ref="chartElement"
      class="statement-comparison-chart"
      role="img"
      :aria-label="`${comparison.preset.label}，${displayYears.length} 年同图对比`"
    ></div>
    <div v-if="!availableSeries.length" class="statement-comparison-empty">当前选择年份没有可绘制的科目数据</div>

    <div class="statement-comparison-note">
      <span>{{ comparison.preset.note }}</span>
      <strong v-if="comparison.missing.length">缺少科目：{{ comparison.missing.join('、') }}</strong>
    </div>
  </section>
</template>
