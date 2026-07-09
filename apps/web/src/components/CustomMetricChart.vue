<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { FinancialStatements, StatementTable } from '../types/finance';

echarts.use([GridComponent, TooltipComponent, LineChart, CanvasRenderer]);

type MetricKind = 'percent' | 'times';

interface MetricPoint {
  year: string;
  value: number | null;
  details: FormulaDetail[];
  expression: string;
}

interface MetricDefinition {
  key: string;
  label: string;
  formula: string;
  kind: MetricKind;
  description: string;
  calculate: (context: MetricContext, year: string, yearIndex: number) => number | null;
  requirements: MetricRequirement[];
}

interface MetricRequirement {
  label: string;
  table: 'balance' | 'income';
  aliases: string[];
}

interface MetricContext {
  statements: FinancialStatements;
  balance: StatementTable | undefined;
  income: StatementTable | undefined;
}

interface MetricResult {
  definition: MetricDefinition;
  points: MetricPoint[];
  latest: number | null;
  missing: string[];
}

interface FormulaDetail {
  label: string;
  value: number | null;
  kind?: MetricKind | 'number';
  note?: string;
}

interface FormulaDetails {
  rows: FormulaDetail[];
  expression: string;
}

const props = defineProps<{
  statements: FinancialStatements | null;
  activeYears: string[];
}>();

const activeMetricKey = ref('roe');
const chartElement = ref<HTMLDivElement | null>(null);
const chart = shallowRef<ECharts | null>(null);

const NET_PROFIT_ALIASES = ['归属于母公司股东的净利润', '股东应占溢利', '股东应占盈利', '净利润', '除税后溢利', 'PARENT NETPROFIT', 'NETPROFIT'];
const EQUITY_ALIASES = ['归属于母公司股东权益', '股东权益', '所有者权益合计', '总权益', '净资产', 'PARENT EQUITY BALANCE', 'EQUITY BALANCE'];
const TOTAL_ASSET_ALIASES = ['资产总计', '总资产', 'TOTAL ASSETS'];
const REVENUE_ALIASES = ['营业收入', '营业总收入', '营业额', '营运收入', '收益', '收入', 'OPERATE INCOME', 'TOTAL OPERATE INCOME'];
const RECEIVABLE_ALIASES = ['应收账款', '应收帐款', '应收票据及应收账款', '应收账款及应收票据', 'ACCOUNTS RECE', 'NOTE ACCOUNTS RECE', '应收款项'];
const GROSS_PROFIT_ALIASES = ['毛利', '毛利润', 'GROSS PROFIT'];
const OPERATING_COST_ALIASES = ['营业成本', 'OPERATE COST'];
const SELLING_EXPENSE_ALIASES = ['销售费用', '销售及分销费用', 'SALE EXPENSE'];
const ADMIN_EXPENSE_ALIASES = ['管理费用', '行政开支', 'MANAGE EXPENSE'];
const FINANCE_EXPENSE_ALIASES = ['财务费用', '融资成本', 'FINANCE EXPENSE'];

const definitions: MetricDefinition[] = [
  {
    key: 'roe',
    label: 'ROE',
    formula: '净利润 / 平均股东权益',
    kind: 'percent',
    description: '衡量股东权益产生利润的效率。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '股东权益', table: 'balance', aliases: EQUITY_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, NET_PROFIT_ALIASES),
        averageBalance(context.balance, year, yearIndex, EQUITY_ALIASES)
      )
  },
  {
    key: 'roa',
    label: 'ROA',
    formula: '净利润 / 平均总资产',
    kind: 'percent',
    description: '衡量资产投入转化为利润的效率。',
    requirements: [
      { label: '净利润', table: 'income', aliases: NET_PROFIT_ALIASES },
      { label: '总资产', table: 'balance', aliases: TOTAL_ASSET_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, NET_PROFIT_ALIASES),
        averageBalance(context.balance, year, yearIndex, TOTAL_ASSET_ALIASES)
      )
  },
  {
    key: 'receivableTurnover',
    label: '应收账款周转率',
    formula: '营业收入 / 应收账款平均余额',
    kind: 'times',
    description: '观察收入回款相关资产的周转速度。',
    requirements: [
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES },
      { label: '应收账款', table: 'balance', aliases: RECEIVABLE_ALIASES }
    ],
    calculate: (context, year, yearIndex) =>
      safeDivide(
        rowValue(context.income, year, REVENUE_ALIASES),
        averageBalance(context.balance, year, yearIndex, RECEIVABLE_ALIASES)
      )
  },
  {
    key: 'grossMargin',
    label: '毛利率',
    formula: '毛利润 / 营业收入',
    kind: 'percent',
    description: '观察主营业务留存的毛利空间。',
    requirements: [
      { label: '毛利润或营业成本', table: 'income', aliases: [...GROSS_PROFIT_ALIASES, ...OPERATING_COST_ALIASES] },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const revenue = rowValue(context.income, year, REVENUE_ALIASES);
      const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
      const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
      const grossProfit = directGrossProfit ?? (
        revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
      );
      return safeDivide(grossProfit, revenue);
    }
  },
  {
    key: 'expenseRatio',
    label: '费用率',
    formula: '(销售费用 + 管理费用 + 财务费用) / 营业收入',
    kind: 'percent',
    description: '观察三费对营业收入的消耗比例。',
    requirements: [
      { label: '销售费用', table: 'income', aliases: SELLING_EXPENSE_ALIASES },
      { label: '管理费用', table: 'income', aliases: ADMIN_EXPENSE_ALIASES },
      { label: '财务费用', table: 'income', aliases: FINANCE_EXPENSE_ALIASES },
      { label: '营业收入', table: 'income', aliases: REVENUE_ALIASES }
    ],
    calculate: (context, year) => {
      const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
      const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
      const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
      const revenue = rowValue(context.income, year, REVENUE_ALIASES);
      return safeDivide(sumAbsolute([selling, admin, finance]), revenue);
    }
  }
];

const metricResults = computed<MetricResult[]>(() => {
  if (!props.statements) {
    return definitions.map((definition) => ({ definition, points: [], latest: null, missing: [] }));
  }

  const context: MetricContext = {
    statements: props.statements,
    balance: props.statements.tables.find((table) => table.type === 'balance'),
    income: props.statements.tables.find((table) => table.type === 'income')
  };
  const years = props.activeYears.length ? props.activeYears : props.statements.years;

  return definitions.map((definition) => {
    const points = years.map((year) => {
      const yearIndex = props.statements!.years.indexOf(year);
      const details = metricDetails(definition, context, year, yearIndex);
      return {
        year,
        value: definition.calculate(context, year, yearIndex),
        details: details.rows,
        expression: details.expression
      };
    });
    const latest = points.find((point) => point.value !== null)?.value ?? null;
    return {
      definition,
      points,
      latest,
      missing: missingRequirements(definition, context)
    };
  });
});

const selectedResult = computed(() =>
  metricResults.value.find((result) => result.definition.key === activeMetricKey.value) ?? metricResults.value[0]
);

const chartOption = computed<EChartsCoreOption>(() => {
  const result = selectedResult.value;
  const displayPoints = result.points.slice().reverse();
  const years = displayPoints.map((point) => point.year);
  const data = displayPoints.map((point) => point.value);

  return {
    grid: { top: 18, right: 18, bottom: 30, left: 48 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      extraCssText: 'max-width: 380px; white-space: normal;',
      formatter: (params: unknown) => formatTooltip(params, result, displayPoints)
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
        itemStyle: { color: '#2563eb' },
        lineStyle: { color: '#2563eb', width: 3 },
        areaStyle: { color: 'rgba(37, 99, 235, 0.08)' },
        data
      }
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

function rowValue(table: StatementTable | undefined, year: string, aliases: string[]): number | null {
  const row = findRow(table, aliases);
  return toNumber(row?.values[year]);
}

function averageBalance(
  table: StatementTable | undefined,
  year: string,
  yearIndex: number,
  aliases: string[]
): number | null {
  if (!props.statements || yearIndex < 0) return null;
  const row = findRow(table, aliases);
  if (!row) return null;

  const current = toNumber(row.values[year]);
  const previousYear = props.statements.years[yearIndex + 1];
  const previous = previousYear ? toNumber(row.values[previousYear]) : null;
  if (current === null || previous === null) return null;
  return (current + previous) / 2;
}

function metricDetails(
  definition: MetricDefinition,
  context: MetricContext,
  year: string,
  yearIndex: number
): FormulaDetails {
  if (definition.key === 'roe') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const equity = averageBalanceDetails(context, context.balance, year, yearIndex, EQUITY_ALIASES);
    const value = safeDivide(netProfit, equity.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: `${year} 股东权益`, value: equity.current, note: '期末' },
        { label: `${equity.previousYear ?? '上年'} 股东权益`, value: equity.previous, note: '期初' },
        { label: '平均股东权益', value: equity.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(equity.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'roa') {
    const netProfit = rowValue(context.income, year, NET_PROFIT_ALIASES);
    const assets = averageBalanceDetails(context, context.balance, year, yearIndex, TOTAL_ASSET_ALIASES);
    const value = safeDivide(netProfit, assets.average);
    return {
      rows: [
        { label: '净利润', value: netProfit },
        { label: `${year} 总资产`, value: assets.current, note: '期末' },
        { label: `${assets.previousYear ?? '上年'} 总资产`, value: assets.previous, note: '期初' },
        { label: '平均总资产', value: assets.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(netProfit)} / ${formatRawValue(assets.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'receivableTurnover') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const receivable = averageBalanceDetails(context, context.balance, year, yearIndex, RECEIVABLE_ALIASES);
    const value = safeDivide(revenue, receivable.average);
    return {
      rows: [
        { label: '营业收入', value: revenue },
        { label: `${year} 应收账款`, value: receivable.current, note: '期末' },
        { label: `${receivable.previousYear ?? '上年'} 应收账款`, value: receivable.previous, note: '期初' },
        { label: '应收账款平均余额', value: receivable.average, note: '(期初 + 期末) / 2' }
      ],
      expression: `${formatRawValue(revenue)} / ${formatRawValue(receivable.average)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  if (definition.key === 'grossMargin') {
    const revenue = rowValue(context.income, year, REVENUE_ALIASES);
    const directGrossProfit = rowValue(context.income, year, GROSS_PROFIT_ALIASES);
    const cost = rowValue(context.income, year, OPERATING_COST_ALIASES);
    const grossProfit = directGrossProfit ?? (
      revenue !== null && cost !== null ? revenue - Math.abs(cost) : null
    );
    const value = safeDivide(grossProfit, revenue);
    const rows: FormulaDetail[] = [
      { label: '营业收入', value: revenue }
    ];
    if (directGrossProfit !== null) {
      rows.push({ label: '毛利润', value: directGrossProfit });
    } else {
      rows.push(
        { label: '营业成本', value: cost },
        { label: '推导毛利润', value: grossProfit, note: '营业收入 - |营业成本|' }
      );
    }
    return {
      rows,
      expression: `${formatRawValue(grossProfit)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
    };
  }

  const revenue = rowValue(context.income, year, REVENUE_ALIASES);
  const selling = rowValue(context.income, year, SELLING_EXPENSE_ALIASES);
  const admin = rowValue(context.income, year, ADMIN_EXPENSE_ALIASES);
  const finance = rowValue(context.income, year, FINANCE_EXPENSE_ALIASES);
  const threeFees = sumAbsolute([selling, admin, finance]);
  const value = safeDivide(threeFees, revenue);
  return {
    rows: [
      { label: '营业收入', value: revenue },
      { label: '销售费用', value: selling },
      { label: '管理费用', value: admin },
      { label: '财务费用', value: finance },
      { label: '三费合计', value: threeFees, note: '|销售| + |管理| + |财务|' }
    ],
    expression: `${formatRawValue(threeFees)} / ${formatRawValue(revenue)} = ${formatMetricValue(value, definition.kind)}`
  };
}

function averageBalanceDetails(
  context: MetricContext,
  table: StatementTable | undefined,
  year: string,
  yearIndex: number,
  aliases: string[]
) {
  const row = findRow(table, aliases);
  const current = toNumber(row?.values[year]);
  const previousYear = context.statements.years[yearIndex + 1];
  const previous = previousYear ? toNumber(row?.values[previousYear]) : null;
  const average = current !== null && previous !== null ? (current + previous) / 2 : null;
  return { current, previous, previousYear, average };
}

function findRow(table: StatementTable | undefined, aliases: string[]) {
  if (!table) return undefined;
  const normalizedAliases = aliases.map(normalizeLabel);
  const rows = table.rows.map((row) => ({
    row,
    item: normalizeLabel(row.item)
  }));
  const exact = rows.find(({ item }) => normalizedAliases.some((alias) => item === alias));
  if (exact) return exact.row;

  return rows.find(({ item }) => {
    return normalizedAliases.some((alias) => alias.length >= 6 && item.startsWith(alias));
  })?.row;
}

function missingRequirements(definition: MetricDefinition, context: MetricContext): string[] {
  return definition.requirements
    .filter((requirement) => {
      const table = requirement.table === 'balance' ? context.balance : context.income;
      return !findRow(table, requirement.aliases);
    })
    .map((requirement) => requirement.label);
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized || normalized === '-') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function sumAbsolute(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + Math.abs(value ?? 0), 0);
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
  if (detail.kind === 'percent' || detail.kind === 'times') {
    return formatMetricValue(detail.value, detail.kind);
  }
  return formatRawValue(detail.value);
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()（）\s_、，,]/g, '')
    .replace(/帐/g, '账')
    .replace(/凈/g, '净');
}

function formatMetricValue(value: number | null, kind: MetricKind): string {
  if (value === null) return '-';
  if (kind === 'percent') return `${(value * 100).toFixed(2)}%`;
  return `${value.toFixed(2)} 次`;
}

function formatRawValue(value: number | null): string {
  if (value === null) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}万亿`;
  }
  if (abs >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}亿`;
  }
  if (abs >= 10_000) {
    return `${(value / 10_000).toFixed(2)}万`;
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
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
  if (kind === 'percent') return `${(value * 100).toFixed(0)}%`;
  return value.toFixed(1);
}
</script>

<template>
  <section class="custom-metric-panel">
    <div class="custom-metric-head">
      <div>
        <p class="section-label">自定义指标图表</p>
        <h3>{{ selectedResult.definition.label }}</h3>
      </div>
      <strong>{{ formatMetricValue(selectedResult.latest, selectedResult.definition.kind) }}</strong>
    </div>

    <div class="metric-selector" aria-label="自定义指标">
      <button
        v-for="result in metricResults"
        :key="result.definition.key"
        :class="{ active: activeMetricKey === result.definition.key }"
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

    <div v-if="selectedResult.missing.length" class="metric-warning">
      缺少科目：{{ selectedResult.missing.join('、') }}
    </div>
  </section>
</template>
