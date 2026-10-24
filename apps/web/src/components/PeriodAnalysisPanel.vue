<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarRange, TrendingUp } from 'lucide-vue-next';
import { formatNumber } from '../app/app-formatters';
import {
  buildPeriodMetricCards,
  latestPeriodWithData,
  reportPeriodComparisons,
  reportPeriodLabels
} from '../finance/period-analysis';
import type {
  FinancialStatements,
  StatementTable,
  StatementType
} from '../types/finance';
import StatementTableView from './StatementTable.vue';

const props = defineProps<{
  statements: FinancialStatements | null;
}>();

const activeStatement = ref<StatementType>('income');
const reportPeriods = computed(() => props.statements?.reportPeriods ?? []);
const periodHighlights = computed(() => props.statements?.periodHighlights ?? []);
const ttmHighlights = computed(() => props.statements?.ttmHighlights ?? []);
const latestPeriod = computed(() =>
  latestPeriodWithData(reportPeriods.value, periodHighlights.value)
);
const cumulativeCards = computed(() =>
  buildPeriodMetricCards(periodHighlights.value, latestPeriod.value)
);
const ttmCards = computed(() =>
  buildPeriodMetricCards(ttmHighlights.value, latestPeriod.value)
);
const labels = computed(() => reportPeriodLabels(reportPeriods.value));
const comparisons = computed(() => reportPeriodComparisons(reportPeriods.value));
const activePeriodTable = computed(() =>
  props.statements?.periodTables?.find((table) => table.type === activeStatement.value)
);
const visiblePeriods = computed(() => {
  const available = new Set(activePeriodTable.value?.periods ?? []);
  return reportPeriods.value
    .map((period) => period.key)
    .filter((period) => available.has(period))
    .slice(0, 8);
});
const statementTable = computed<StatementTable | undefined>(() => {
  const table = activePeriodTable.value;
  if (!table) return undefined;
  return {
    type: table.type,
    title: `${table.title}（报告期）`,
    years: table.periods,
    rows: table.rows
  };
});

watch(
  () => props.statements?.company.symbol,
  () => {
    activeStatement.value = 'income';
  }
);

function formatPercent(value: number | null): string {
  if (value === null) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
</script>

<template>
  <section class="period-analysis-panel">
    <header class="period-analysis-head">
      <div>
        <span><CalendarRange :size="16" />最新报告期</span>
        <h2>{{ latestPeriod?.label ?? '季度与中报分析' }}</h2>
      </div>
      <small>累计同比按同报告期比较；TTM 为最近十二个月口径</small>
    </header>

    <div v-if="latestPeriod" class="period-analysis-summary">
      <section>
        <div class="period-section-title">
          <strong>报告期累计</strong>
          <span>{{ latestPeriod.label }} / 同比</span>
        </div>
        <div class="period-metric-grid">
          <article v-for="card in cumulativeCards" :key="card.key">
            <span>{{ card.label }}</span>
            <strong>{{ formatNumber(card.value) }}</strong>
            <em :class="{ up: (card.yoy ?? 0) >= 0, down: (card.yoy ?? 0) < 0 }">
              <TrendingUp :size="14" />
              {{ formatPercent(card.yoy) }}
            </em>
          </article>
        </div>
      </section>

      <section>
        <div class="period-section-title">
          <strong>TTM</strong>
          <span>本期累计＋上年年报－上年同期</span>
        </div>
        <div class="period-metric-grid ttm">
          <article v-for="card in ttmCards" :key="card.key">
            <span>{{ card.label }}</span>
            <strong>{{ formatNumber(card.value) }}</strong>
            <em :class="{ up: (card.yoy ?? 0) >= 0, down: (card.yoy ?? 0) < 0 }">
              <TrendingUp :size="14" />
              {{ formatPercent(card.yoy) }}
            </em>
          </article>
        </div>
      </section>
    </div>

    <div v-else class="period-analysis-empty">
      <strong>当前缓存还没有报告期数据</strong>
      <span>点击页面下方“刷新”后，将拉取最新季报、中报和 TTM 基础数据。</span>
    </div>

    <template v-if="statementTable && visiblePeriods.length">
      <div class="period-statement-toolbar">
        <div>
          <strong>报告期明细</strong>
          <span>默认展示最近 8 个报告期</span>
        </div>
        <div class="tabs" aria-label="报告期报表">
          <button
            v-for="tab in [
              { type: 'balance', label: '资产负债表' },
              { type: 'income', label: '利润表' },
              { type: 'cashflow', label: '现金流量表' }
            ]"
            :key="tab.type"
            :class="{ active: activeStatement === tab.type }"
            type="button"
            @click="activeStatement = tab.type as StatementType"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <StatementTableView
        :table="statementTable"
        :active-years="visiblePeriods"
        :column-labels="labels"
        :comparison-keys="comparisons"
        :report-periods="reportPeriods"
      />
    </template>
  </section>
</template>
