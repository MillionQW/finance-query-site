<script setup lang="ts">
import { computed, ref } from 'vue';
import { businessComparison, researchNumber as num } from '../finance/research-tracking';
import type { BusinessData, ResearchEntry } from '../types/research-tracking';

type ChartEntry = ResearchEntry<BusinessData> & { comparison: ReturnType<typeof businessComparison> };
const props = defineProps<{ entries: ChartEntry[] }>();
const selection = ref('');
const groups = computed(() => {
  const byIdentity = new Map<string, { key: string; label: string; unit: string; entries: ChartEntry[] }>();
  for (const entry of props.entries) {
    const { archived, origin, dimension, metric, currency, unit, basis, value } = entry.data;
    if (archived || origin?.missing || !Number.isFinite(value)) continue;
    const key = JSON.stringify([metric, dimension, currency, unit, basis]);
    const label = [metric, dimension, [unit, currency].filter(Boolean).join(' '), basis].filter(Boolean).join(' · ');
    const group = byIdentity.get(key) ?? { key, label, unit, entries: [] };
    group.entries.push(entry);
    byIdentity.set(key, group);
  }
  return [...byIdentity.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
});
const activeGroup = computed(() => groups.value.find(group => group.key === selection.value)
  ?? groups.value.find(group => group.entries[0].data.metric === '收入' && group.entries[0].data.dimension !== '整体')
  ?? groups.value[0]);
const rows = computed(() => [...(activeGroup.value?.entries ?? [])].sort((a, b) => b.data.value - a.data.value));
const hasPrior = computed(() => rows.value.some(entry => entry.comparison.previous !== null));
const scale = computed(() => {
  let min = 0, max = 0;
  for (const { data, comparison } of rows.value) {
    min = Math.min(min, data.value, comparison.previous ?? 0);
    max = Math.max(max, data.value, comparison.previous ?? 0);
  }
  return { min, max: max === min ? 1 : max };
});
function position(value: number) {
  const { min, max } = scale.value;
  return (value - min) / (max - min) * 100;
}
function bar(value: number) {
  return { left: `${position(Math.min(value, 0))}%`, width: `${Math.abs(position(value) - position(0))}%` };
}
</script>

<template>
  <section v-if="activeGroup" class="business-chart" aria-label="分业务指标对比图">
    <h3>分业务指标对比</h3>
    <label>图表指标与口径
      <select :value="activeGroup.key" @change="selection = ($event.target as HTMLSelectElement).value">
        <option v-for="group in groups" :key="group.key" :value="group.key">{{ group.label }}</option>
      </select>
    </label>
    <div class="business-chart-legend" aria-hidden="true">
      <span><i class="current" />本期</span><span v-if="hasPrior"><i class="prior" />上年同期</span>
    </div>
    <ul class="business-chart-rows" :style="{ '--zero-position': position(0) + '%' }">
      <li v-for="entry in rows" :key="entry.id">
        <strong>{{ entry.data.segment }}</strong>
        <div class="business-chart-series">
          <span class="business-chart-value">本期 {{ num(entry.data.value) }} {{ activeGroup.unit }}</span>
          <div class="business-chart-track" aria-hidden="true"><i class="current" :style="bar(entry.data.value)" /></div>
          <template v-if="hasPrior">
            <span class="business-chart-value">上年同期 {{ entry.comparison.previous === null ? '—' : `${num(entry.comparison.previous)} ${activeGroup.unit}` }}</span>
            <div class="business-chart-track" aria-hidden="true"><i v-if="entry.comparison.previous !== null" class="prior" :style="bar(entry.comparison.previous)" /></div>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.business-chart { margin-top: 16px; padding: 16px; border: 1px solid #dce5ee; border-radius: 12px; background: #f8fbff; }
.business-chart h3 { margin: 0 0 12px; }
.business-chart label { max-width: 42rem; font-size: 14px; }
.business-chart-legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; font-size: 13px; }
.business-chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
.business-chart-legend i { width: 10px; height: 10px; border-radius: 2px; }
.business-chart-rows { margin: 8px 0 0; padding: 0; list-style: none; }
.business-chart-rows li { padding: 10px 0; border-top: 1px solid #e6edf4; }
.business-chart-rows strong { font-size: 14px; overflow-wrap: anywhere; }
.business-chart-series { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 48%); align-items: center; gap: 5px 12px; margin-top: 5px; }
.business-chart-value { grid-column: 2; grid-row: auto; font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.business-chart-track { grid-column: 1; position: relative; height: 10px; background: #edf2f8; border-radius: 2px; }
.business-chart-track:nth-child(2) { grid-row: 1; }
.business-chart-track:nth-child(4) { grid-row: 2; }
.business-chart-track::after { content: ''; position: absolute; top: -2px; bottom: -2px; left: var(--zero-position); border-left: 1px solid #62748a; }
.business-chart-track i { position: absolute; height: 100%; border-radius: 2px; }
.current { background: #326bb2; }
.prior { background: #859bb3; }
</style>
