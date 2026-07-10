<script setup lang="ts">
import { computed, ref } from 'vue';
import type { StatementTable } from '../types/finance';

type ValueDisplayUnit = 'raw' | 'wan' | 'yi';
type StatementViewMode = 'value' | 'yoy' | 'ratio';
type CellTone = 'up' | 'down' | 'flat';

type StatementRowLike = StatementTable['rows'][number];

const props = defineProps<{
  table?: StatementTable;
  activeYears: string[];
}>();

const unitDivisors: Record<ValueDisplayUnit, number> = {
  raw: 1,
  wan: 10_000,
  yi: 100_000_000
};

const viewModeOptions: { value: StatementViewMode; label: string }[] = [
  { value: 'value', label: '原值' },
  { value: 'yoy', label: '同比' },
  { value: 'ratio', label: '占比' }
];

const valueUnitOptions: { value: ValueDisplayUnit; label: string }[] = [
  { value: 'raw', label: '原始' },
  { value: 'wan', label: '万' },
  { value: 'yi', label: '亿' }
];

const viewMode = ref<StatementViewMode>('value');
const valueUnit = ref<ValueDisplayUnit>('yi');
const visibleRows = computed(() => props.table?.rows ?? []);
const ratioBaseRow = computed(() => findRatioBaseRow());

function sourceTitle(row: { item: string; sourceItem?: string | null }): string | undefined {
  if (!row.sourceItem || row.sourceItem === row.item) {
    return undefined;
  }
  return row.sourceItem;
}

function parseNumericValue(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function rowNumericValue(row: StatementRowLike, year: string): number | null {
  const value = row.values[year];
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return parseNumericValue(value);
}

function rowValue(row: StatementRowLike, year: string): number | string | null | undefined {
  return row.values[year];
}

function findRatioBaseRow(): StatementRowLike | undefined {
  const table = props.table;
  if (!table) {
    return undefined;
  }

  const aliasMap: Record<StatementTable['type'], string[]> = {
    balance: ['资产总计', '总资产', 'TOTAL_ASSETS'],
    income: ['营业收入', '营业总收入', '收入', 'OPERATE_INCOME', 'REVENUE', 'TURNOVER'],
    cashflow: [
      '经营活动产生的现金流量净额',
      '经营现金流量净额',
      '经营现金流',
      'NETCASH_OPERATE',
      'NET_CASH_FLOWS_OPERATING_ACTIVITIES'
    ]
  };

  const aliases = aliasMap[table.type].map((alias) => normalizeLabel(alias));
  return table.rows.find((row) => {
    const candidates = [row.item, row.sourceItem ?? ''].map((value) => normalizeLabel(value));
    return candidates.some((candidate) => aliases.some((alias) => candidate === alias || candidate.includes(alias)));
  });
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, '').replace(/_/g, '').toUpperCase();
}

function previousYear(year: string): string | undefined {
  const years = props.table?.years ?? [];
  const index = years.indexOf(year);
  return index >= 0 ? years[index + 1] : undefined;
}

function formatNumberValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const numeric = parseNumericValue(value);
  if (numeric === null) {
    return String(value);
  }

  const scaledValue = numeric / unitDivisors[valueUnit.value];
  const absValue = Math.abs(scaledValue);
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: valueUnit.value === 'raw' || absValue >= 1 ? 2 : 4
  }).format(scaledValue);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value * 100)}%`;
}

function yoyValue(row: StatementRowLike, year: string): number | null {
  const current = rowNumericValue(row, year);
  const priorYear = previousYear(year);
  const prior = priorYear ? rowNumericValue(row, priorYear) : null;
  if (current === null || prior === null || prior === 0) {
    return null;
  }
  return (current - prior) / prior;
}

function yoyTone(row: StatementRowLike, year: string): CellTone {
  const current = rowNumericValue(row, year);
  const priorYear = previousYear(year);
  const prior = priorYear ? rowNumericValue(row, priorYear) : null;
  if (current === null || prior === null || current === prior) {
    return 'flat';
  }
  return current > prior ? 'up' : 'down';
}

function ratioValue(row: StatementRowLike, year: string): number | null {
  const current = rowNumericValue(row, year);
  const base = ratioBaseRow.value ? rowNumericValue(ratioBaseRow.value, year) : null;
  if (current === null || base === null || base === 0) {
    return null;
  }
  return current / base;
}

function formatMetricValue(row: StatementRowLike, year: string): string {
  if (viewMode.value === 'yoy') {
    return formatPercent(yoyValue(row, year));
  }
  if (viewMode.value === 'ratio') {
    return formatPercent(ratioValue(row, year));
  }
  return formatNumberValue(rowValue(row, year));
}

function cellTone(row: StatementRowLike, year: string): CellTone {
  return viewMode.value === 'yoy' ? yoyTone(row, year) : 'flat';
}

function formatRawValue(row: StatementRowLike, year: string): string {
  return formatNumberValue(rowValue(row, year));
}
</script>

<template>
  <div v-if="table && visibleRows.length" class="statement-table-tools">
    <div class="unit-switch" aria-label="StatementTable 展示方式">
      <span>表格视图</span>
      <button
        v-for="mode in viewModeOptions"
        :key="mode.value"
        :class="{ active: viewMode === mode.value }"
        type="button"
        @click="viewMode = mode.value"
      >
        {{ mode.label }}
      </button>
    </div>

    <div class="unit-switch" aria-label="StatementTable 数值单位">
      <span>表格数值</span>
      <button
        v-for="unit in valueUnitOptions"
        :key="unit.value"
        :class="{ active: valueUnit === unit.value }"
        type="button"
        @click="valueUnit = unit.value"
      >
        {{ unit.label }}
      </button>
    </div>
  </div>

  <div class="table-wrap">
    <table v-if="table && visibleRows.length" class="statement-table">
      <thead>
        <tr>
          <th class="item-col">项目</th>
          <th v-for="year in activeYears" :key="year">{{ year }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="`${row.item}-${row.sourceItem ?? ''}`">
          <th
            class="item-col"
            :class="{ 'has-source-title': sourceTitle(row) }"
            :title="sourceTitle(row)"
            :tabindex="sourceTitle(row) ? 0 : undefined"
          >
            <span class="item-name">{{ row.item }}</span>
            <span v-if="sourceTitle(row)" class="item-source-tooltip">{{ sourceTitle(row) }}</span>
          </th>
          <td v-for="year in activeYears" :key="year">
            <span v-if="viewMode === 'value'">{{ formatRawValue(row, year) }}</span>
            <span v-else class="statement-cell-stack">
              <span class="statement-cell-main" :class="cellTone(row, year)">
                {{ formatMetricValue(row, year) }}
              </span>
              <span class="statement-cell-raw">{{ formatRawValue(row, year) }}</span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty-table">
      <strong>暂无表格数据</strong>
      <span>AKShare 当前没有返回这张报表，或字段结构暂未识别。</span>
    </div>
  </div>
</template>
