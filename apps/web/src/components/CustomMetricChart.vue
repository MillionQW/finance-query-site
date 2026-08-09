<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { FinancialStatements } from '../types/finance';
import { CASH_FLOW_CLASSIFICATIONS } from '../finance/cash-flow-classification';
import { REVENUE_ALIASES } from '../finance/financial-metric-fields';
import { formatMetricValue, formatRawValue, growthRate, rowValue } from '../finance/financial-metric-engine';
import {
  isCriticalMetric,
  isPositiveMetric,
  isWarningMetric
} from '../finance/financial-metric-alerts';
import {
  buildFinancialDiagnostics
} from '../finance/financial-diagnostics';
import type {
  DiagnosticMetric
} from '../finance/financial-diagnostics';
import {
  metricThresholdGuide
} from '../finance/financial-metric-thresholds';
import type {
  FormulaDetail,
  MetricGroupKey,
  MetricKind,
  MetricPoint,
  MetricResult
} from '../finance/financial-metric-types';
import {
  definitions,
  definitionForMarket,
  metricGroups
} from '../finance/financial-metric-definitions';
import {
  evaluateFinancialMetrics
} from '../finance/financial-metric-evaluator';

echarts.use([AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent, LineChart, CanvasRenderer]);

const props = defineProps<{
  statements: FinancialStatements | null;
  activeYears: string[];
}>();

const activeMetricKey = ref('roe');
const activeMetricGroup = ref<MetricGroupKey>('profitability');
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const activeDefinitions = computed(() => {
  const market = props.statements?.company.market ?? 'a';
  return definitions
    .filter((definition) => market !== 'hk' || definition.key !== 'tangOperatingMargin')
    .map((definition) => definitionForMarket(definition, market));
});

const metricResults = computed<MetricResult[]>(() =>
  evaluateFinancialMetrics(props.statements, props.activeYears, activeDefinitions.value)
);

const diagnosticSections = computed(() => buildFinancialDiagnostics(metricResults.value));

const groupedMetricResults = computed(() =>
  metricResults.value.filter((result) => result.definition.group === activeMetricGroup.value)
);

const selectedResult = computed(() =>
  metricResults.value.find((result) => result.definition.key === activeMetricKey.value) ??
  groupedMetricResults.value[0] ??
  metricResults.value[0]
);

const selectedThresholdGuide = computed(() => metricThresholdGuide(selectedResult.value));

watch(activeMetricGroup, () => {
  const current = metricResults.value.find((result) => result.definition.key === activeMetricKey.value);
  if (current?.definition.group === activeMetricGroup.value) return;
  activeMetricKey.value = groupedMetricResults.value[0]?.definition.key ?? metricResults.value[0]?.definition.key ?? 'roe';
});

function selectDiagnosticMetric(metric: Pick<DiagnosticMetric, 'group' | 'metricKey'>): void {
  activeMetricGroup.value = metric.group;
  activeMetricKey.value = metric.metricKey;
}

const chartOption = computed<EChartsCoreOption>(() => {
  const result = selectedResult.value;
  const seriesColor = isCriticalMetric(result)
    ? '#dc2626'
    : isPositiveMetric(result)
      ? '#16a34a'
      : isWarningMetric(result)
        ? '#d97706'
        : '#2563eb';
  const areaColor = isCriticalMetric(result)
    ? 'rgba(220, 38, 38, 0.08)'
    : isPositiveMetric(result)
      ? 'rgba(22, 163, 74, 0.10)'
      : isWarningMetric(result)
        ? 'rgba(217, 119, 6, 0.09)'
        : 'rgba(37, 99, 235, 0.08)';
  const displayPoints = result.points.slice().reverse();
  const years = displayPoints.map((point) => point.year);
  const data = displayPoints.map((point) => point.value);
  const showRevenueGrowth = result.definition.key === 'expenseRatio' || result.definition.key === 'receivableTurnover';
  const revenueGrowthData = displayPoints.map((point) => {
    if (!props.statements) return null;
    const income = props.statements.tables.find((table) => table.type === 'income');
    const yearIndex = props.statements.years.indexOf(point.year);
    const previousYear = props.statements.years[yearIndex + 1];
    return growthRate(
      rowValue(income, point.year, REVENUE_ALIASES),
      previousYear ? rowValue(income, previousYear, REVENUE_ALIASES) : null
    );
  });

  return {
    grid: { top: showRevenueGrowth ? 48 : 18, right: 18, bottom: 30, left: 48 },
    legend: showRevenueGrowth
      ? { top: 8, right: 18, textStyle: { color: '#64748b', fontSize: 12 } }
      : { show: false },
    tooltip: {
      show: true,
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      extraCssText: 'max-width: 380px; white-space: normal;',
      formatter: (params: unknown) => formatTooltip(params, result, displayPoints)
    },
    axisPointer: {
      type: 'line',
      snap: true
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
      ...(result.definition.kind === 'judgment'
        ? { min: 0, max: 1, interval: 1 }
        : result.definition.kind === 'classification'
          ? { min: 1, max: 8, interval: 1 }
          : {}),
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (value: number) => formatAxisValue(value, result.definition.kind)
      },
      splitLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: [
      {
        name: result.definition.label,
        type: 'line',
        smooth: true,
        connectNulls: false,
        symbolSize: 7,
        label: {
          show: true,
          position: 'top',
          color: seriesColor,
          fontSize: 11,
          fontWeight: 700,
          formatter: (params: { value: number | null }) =>
            params.value === null ? '' : formatMetricValue(params.value, result.definition.kind)
        },
        itemStyle: { color: seriesColor },
        lineStyle: { color: seriesColor, width: 3 },
        areaStyle: { color: areaColor },
        data
      },
      ...(showRevenueGrowth
        ? [{
            name: '营业收入增幅',
            type: 'line' as const,
            smooth: true,
            connectNulls: false,
            symbolSize: 6,
            label: {
              show: true,
              position: 'bottom' as const,
              color: '#b45309',
              fontSize: 11,
              fontWeight: 700,
              formatter: (params: { value: number | null }) =>
                params.value === null ? '' : formatMetricValue(params.value, 'percent')
            },
            itemStyle: { color: '#f59e0b' },
            lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' as const },
            data: revenueGrowthData
          }]
        : [])
    ]
  };
});

watch(chartOption, async (option) => {
  await nextTick();
  chart.value?.setOption(option, true);
});

watch(selectedResult, () => {
  chart.value?.resize();
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
  window.removeEventListener('resize', resizeChart);
  chart.value?.dispose();
});

function resizeChart(): void {
  chart.value?.resize();
}

function formatTooltip(
  params: unknown,
  result: MetricResult,
  displayPoints: MetricPoint[]
): string {
  const point = displayPoints[getTooltipDataIndex(params)] ?? displayPoints[0];
  if (!point) return '';

  const rows = point.details
    .map((detail) => `
      <tr>
        <th>${escapeHtml(detail.label)}</th>
        <td>${escapeHtml(formatDetailValue(detail))}</td>
        <td>${escapeHtml(detail.note ?? '')}</td>
      </tr>
    `)
    .join('');

  return `
    <div class="metric-tooltip-content">
      <div class="metric-tooltip-title">
        <strong>${escapeHtml(point.year)} ${escapeHtml(result.definition.label)}</strong>
        <span>${escapeHtml(formatMetricValue(point.value, result.definition.kind))}</span>
      </div>
      <div class="metric-tooltip-formula">${escapeHtml(result.definition.formula)}</div>
      <div class="metric-tooltip-expression">${escapeHtml(point.expression)}</div>
      <table>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function getTooltipDataIndex(params: unknown): number {
  const firstParam = Array.isArray(params) ? params[0] : params;
  if (!firstParam || typeof firstParam !== 'object') return 0;
  const dataIndex = (firstParam as { dataIndex?: unknown }).dataIndex;
  return typeof dataIndex === 'number' ? dataIndex : 0;
}

function formatDetailValue(detail: FormulaDetail): string {
  if (detail.displayValue) return detail.displayValue;
  if (detail.kind && detail.kind !== 'number') {
    return formatMetricValue(detail.value, detail.kind);
  }
  return formatRawValue(detail.value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAxisValue(value: number, kind: MetricKind): string {
  if (kind === 'classification') return formatMetricValue(value, kind);
  if (kind === 'judgment') return value === 1 ? '通过' : '不通过';
  if (kind === 'percent') return `${(value * 100).toFixed(0)}%`;
  if (kind === 'amount') return formatRawValue(value);
  if (kind === 'days') return `${value.toFixed(0)}天`;
  return value.toFixed(1);
}
</script>

<template>
  <section class="custom-metric-panel">
    <div class="custom-metric-head">
      <div>
        <p class="section-label">财报能力与风险指标</p>
        <h3>{{ selectedResult.definition.label }}</h3>
      </div>
      <strong :class="{
        critical: isCriticalMetric(selectedResult),
        positive: isPositiveMetric(selectedResult),
        warning: isWarningMetric(selectedResult)
      }">
        {{ formatMetricValue(selectedResult.latest, selectedResult.definition.kind) }}
      </strong>
    </div>

    <div class="financial-diagnostic-grid" aria-label="企业财务诊断">
      <article
        v-for="section in diagnosticSections"
        :key="section.key"
        :class="['financial-diagnostic-card', section.tone]"
      >
        <header>
          <div>
            <span>{{ section.eyebrow }}</span>
            <h4>{{ section.title }}</h4>
          </div>
          <strong>{{ section.status }}</strong>
        </header>
        <p>{{ section.summary }}</p>
        <div v-if="section.signals.length" class="diagnostic-signal-list">
          <button
            v-for="signal in section.signals"
            :key="`${signal.metricKey}-${signal.message}`"
            :class="signal.tone"
            type="button"
            @click="selectDiagnosticMetric(signal)"
          >
            {{ signal.message }}
          </button>
        </div>
        <div v-if="section.metrics.length" class="diagnostic-metric-list">
          <button
            v-for="metric in section.metrics"
            :key="metric.metricKey"
            :class="metric.tone"
            type="button"
            :aria-label="`查看${metric.label}明细`"
            @click="selectDiagnosticMetric(metric)"
          >
            <span>{{ metric.label }}</span>
            <strong>{{ formatMetricValue(metric.value, metric.kind) }}</strong>
          </button>
        </div>
        <small>数据覆盖 {{ section.availableCount }}/{{ section.totalCount }} 项 · 点击指标查看明细</small>
      </article>
    </div>

    <div class="metric-group-tabs" aria-label="指标分组">
      <button
        v-for="group in metricGroups"
        :key="group.key"
        :class="{ active: activeMetricGroup === group.key }"
        type="button"
        @click="activeMetricGroup = group.key"
      >
        {{ group.label }}
      </button>
    </div>

    <div class="metric-selector" aria-label="财务指标">
      <button
        v-for="result in groupedMetricResults"
        :key="result.definition.key"
        :class="{
          active: activeMetricKey === result.definition.key,
          critical: isCriticalMetric(result),
          positive: isPositiveMetric(result),
          warning: isWarningMetric(result)
        }"
        type="button"
        @click="activeMetricKey = result.definition.key"
      >
        <span>{{ result.definition.label }}</span>
        <strong>{{ formatMetricValue(result.latest, result.definition.kind) }}</strong>
      </button>
    </div>

    <div ref="chartElement" class="custom-chart" role="img" :aria-label="`${selectedResult.definition.label} 趋势图`"></div>

    <div class="formula-row">
      <span>{{ selectedResult.definition.formula }}</span>
      <small>{{ selectedResult.definition.description }}</small>
    </div>

    <div
      v-if="selectedResult.definition.key === 'cashFlowCompanyType'"
      class="cash-flow-classification-guide"
    >
      <div class="cash-flow-classification-head">
        <strong>八类现金流组合参考</strong>
        <small>当前年度分类已高亮</small>
      </div>
      <div class="cash-flow-classification-table-wrap">
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>经营</th>
              <th>投资</th>
              <th>筹资</th>
              <th>企业类型</th>
              <th>关注要点</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in CASH_FLOW_CLASSIFICATIONS"
              :key="item.code"
              :class="{ active: selectedResult.latest === item.code }"
            >
              <td>{{ item.code }}</td>
              <td>{{ item.operatingSign }}</td>
              <td>{{ item.investingSign }}</td>
              <td>{{ item.financingSign }}</td>
              <td>
                <strong>{{ item.companyType }}</strong>
                <small v-if="item.note">{{ item.note }}</small>
              </td>
              <td>{{ item.focus }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="selectedThresholdGuide" class="metric-threshold-guide">
      <div class="metric-threshold-head">
        <strong>判断阈值</strong>
        <small>基于单项指标的固定规则，不代表行业排名或综合评分</small>
      </div>
      <div class="metric-threshold-bands">
        <div
          v-for="band in selectedThresholdGuide.bands"
          :key="`${band.tone}-${band.condition}`"
          :class="[
            'metric-threshold-band',
            band.tone,
            { active: selectedThresholdGuide.activeTone === band.tone }
          ]"
        >
          <span>{{ band.label }}</span>
          <strong>{{ band.condition }}</strong>
        </div>
      </div>
    </div>

    <div v-if="selectedResult.missing.length" class="metric-warning">
      缺少科目：{{ selectedResult.missing.join('、') }}
    </div>

    <div v-if="selectedResult.alerts.length" class="metric-alert-list">
      <div
        v-for="alert in selectedResult.alerts"
        :key="`${alert.year ?? 'metric'}-${alert.message}`"
        :class="['metric-alert', alert.tone]"
      >
        {{ alert.message }}
      </div>
    </div>
  </section>
</template>
