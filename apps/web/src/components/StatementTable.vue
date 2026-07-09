<script setup lang="ts">
import { computed } from 'vue';
import type { StatementTable } from '../types/finance';

const props = defineProps<{
  table?: StatementTable;
  activeYears: string[];
}>();

const visibleRows = computed(() => props.table?.rows ?? []);

function formatValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: 2
    }).format(value);
  }
  return String(value);
}
</script>

<template>
  <div class="table-wrap">
    <table v-if="table && visibleRows.length" class="statement-table">
      <thead>
        <tr>
          <th class="item-col">项目</th>
          <th v-for="year in activeYears" :key="year">{{ year }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="row.item">
          <th class="item-col">{{ row.item }}</th>
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
