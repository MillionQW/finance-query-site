<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { X } from 'lucide-vue-next';
import * as echarts from 'echarts/core';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { ReportPeriod, StatementRow } from '../types/finance';
import { statementTrendGroups } from '../finance/statement-trend';

echarts.use([GridComponent, TooltipComponent, LineChart, CanvasRenderer]);

type ValueDisplayUnit = 'raw' | 'wan' | 'yi';

const props = defineProps<{
  row: StatementRow;
  years: string[];
  unit: ValueDisplayUnit;
  reportPeriods?: ReportPeriod[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);
const selectedGroupKey = ref('annual');
const periodGroups = computed(() => statementTrendGroups(props.reportPeriods ?? [], props.years));
const selectedGroup = computed(() =>
  periodGroups.value.find((group) => group.key === selectedGroupKey.value) ?? periodGroups.value[0]
);
const trendPeriods = computed(() => props.reportPeriods
  ? selectedGroup.value?.periods ?? []
  : [...props.years].sort().map((key) => ({ key, label: key }))
);

const unitDivisors: Record<ValueDisplayUnit, number> = {
  raw: 1,
  wan: 10_000,
  yi: 100_000_000
};

const unitLabels: Record<ValueDisplayUnit, string> = {
  raw: '原始单位',
  wan: '万',
  yi: '亿'
};

const points = computed(() =>
  trendPeriods.value.map((period) => {
    const rawValue = parseNumericValue(props.row.values[period.key]);
    return {
      year: period.label,
      rawValue,
      value: rawValue === null ? null : rawValue / unitDivisors[props.unit]
    };
  })
);

const hasData = computed(() => points.value.some((point) => point.value !== null));

const chartOption = computed<EChartsCoreOption>(() => ({
  animationDuration: 300,
  grid: { top: 52, right: 32, bottom: 34, left: props.unit === 'raw' ? 112 : 88 },
  tooltip: {
    trigger: 'axis',
    confine: true,
    formatter: (params: unknown) => formatTooltip(params)
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: points.value.map((point) => point.year),
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    axisTick: { show: false },
    axisLabel: { color: '#64748b', fontSize: 11 }
  },
  yAxis: {
    type: 'value',
    boundaryGap: ['8%', '18%'],
    name: unitLabels[props.unit],
    nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 0, 8] },
    axisLabel: {
      color: '#64748b',
      fontSize: 11,
      formatter: (value: number) => formatAxisValue(value)
    },
    splitLine: { lineStyle: { color: '#e5e7eb' } }
  },
  series: [
    {
      name: props.row.item,
      type: 'line',
      data: points.value.map((point) => point.value),
      connectNulls: false,
      showSymbol: true,
      symbolSize: 7,
      smooth: false,
      lineStyle: { width: 3, color: '#2563eb' },
      itemStyle: { color: '#2563eb', borderColor: '#ffffff', borderWidth: 2 },
      label: {
        show: true,
        position: 'top',
        distance: 8,
        color: '#334155',
        fontSize: 11,
        fontWeight: 700,
        textBorderColor: '#ffffff',
        textBorderWidth: 4,
        formatter: (params: { value?: unknown }) =>
          typeof params.value === 'number' ? formatValue(params.value) : ''
      },
      areaStyle: { color: 'rgba(37, 99, 235, 0.08)' }
    }
  ]
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
  if (hasData.value && !chart.value && chartElement.value) {
    chart.value = echarts.init(chartElement.value);
  }
}

function resizeChart(): void {
  chart.value?.resize();
}

function parseNumericValue(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatAxisValue(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2
  }).format(value);
}

function formatValue(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: props.unit === 'raw' || Math.abs(value) >= 1 ? 2 : 4
  }).format(value);
}

function formatTooltip(params: unknown): string {
  const entries = Array.isArray(params) ? params : [params];
  const entry = entries[0] as { dataIndex?: number } | undefined;
  const point = typeof entry?.dataIndex === 'number' ? points.value[entry.dataIndex] : undefined;
  if (!point) return '';

  return [
    `<strong>${escapeHtml(point.year)}</strong>`,
    `<div class="statement-trend-tooltip-row"><span>${escapeHtml(props.row.item)}</span><b>${formatValue(point.value)} ${unitLabels[props.unit]}</b></div>`,
    props.unit === 'raw' || point.rawValue === null
      ? ''
      : `<small>原始值：${formatValue(point.rawValue)}</small>`
  ].join('');
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
  <section class="statement-item-trend" aria-live="polite">
    <div class="statement-item-trend-head">
      <div>
        <span>科目变化趋势</span>
        <h3>{{ row.item }}</h3>
        <small v-if="row.sourceItem && row.sourceItem !== row.item">{{ row.sourceItem }}</small>
      </div>
      <button type="button" aria-label="关闭科目趋势图" title="关闭" @click="emit('close')">
        <X :size="18" />
      </button>
    </div>

    <div v-if="reportPeriods" class="statement-trend-period-controls">
      <label>
        趋势口径
        <select
          aria-label="科目趋势报告期"
          :value="selectedGroup?.key"
          @change="selectedGroupKey = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="group in periodGroups" :key="group.key" :value="group.key">{{ group.label }}</option>
        </select>
      </label>
      <small>仅比较历年同类报告期；利润及现金流为报告期累计值</small>
    </div>

    <div
      v-show="hasData"
      ref="chartElement"
      class="statement-item-trend-chart"
      role="img"
      :aria-label="`${row.item} ${selectedGroup?.label ?? '年度'}变化趋势，共${points.length}期，单位${unitLabels[unit]}`"
    ></div>
    <div v-if="!hasData" class="statement-item-trend-empty">当前所选报告期没有可绘制的数值</div>
  </section>
</template>

<style scoped>
.statement-trend-period-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 12px;
}
.statement-trend-period-controls label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.statement-trend-period-controls select {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: #334155;
}
</style>
