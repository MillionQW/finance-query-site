<script setup lang="ts">
import { computed, ref } from 'vue';
import type { StatementTable } from '../types/finance';

type ValueDisplayUnit = 'raw' | 'wan' | 'yi';

const props = defineProps<{
  table?: StatementTable;
  activeYears: string[];
}>();

const unitDivisors: Record<ValueDisplayUnit, number> = {
  raw: 1,
  wan: 10_000,
  yi: 100_000_000
};

const valueUnitOptions: { value: ValueDisplayUnit; label: string }[] = [
  { value: 'raw', label: '原始' },
  { value: 'wan', label: '万' },
  { value: 'yi', label: '亿' }
];

const valueUnit = ref<ValueDisplayUnit>('yi');
const visibleRows = computed(() => props.table?.rows ?? []);

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

function formatValue(value: number | string | null | undefined): string {
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
</script>

<template>
  <div v-if="table && visibleRows.length" class="statement-table-tools">
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
          <td v-for="year in activeYears" :key="year">{{ formatValue(row.values[year]) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty-table">
      <strong>暂无表格数据</strong>
      <span>AKShare 当前没有返回这张报表，或字段结构暂未识别。</span>
    </div>
  </div>
</template>
