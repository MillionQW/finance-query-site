<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FinancialStatements } from '../types/finance';
import { buildOperatingPeriods, operatingSignals } from '../finance/operating-periods';
import { formatNumber } from '../app/app-formatters';
import OperatingChangesChart from './OperatingChangesChart.vue';
const props = defineProps<{ statements: FinancialStatements | null }>();
const quarters = computed(() => buildOperatingPeriods(props.statements, 3));
const halves = computed(() => buildOperatingPeriods(props.statements, 6));
const months = ref<3 | 6>(3);
const views = [
  { id: 'growth', label: '增长' },
  { id: 'margin', label: '利润率' },
  { id: 'cash', label: '现金流' }
] as const;
const view = ref<(typeof views)[number]['id']>('growth');
watch([() => props.statements?.company.market, () => props.statements?.company.symbol,
  () => quarters.value.length > 0, () => halves.value.length > 0], () => {
  const latestQuarter = quarters.value[0]?.end ?? '';
  const latestHalf = halves.value[0]?.end ?? '';
  months.value = latestHalf > latestQuarter ? 6 : 3;
  view.value = 'growth';
}, { immediate: true });
const rows = computed(() => months.value === 3 ? quarters.value : halves.value);
const signals = computed(() => operatingSignals(rows.value));
const pct = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const change = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}个百分点`;
</script>
<template>
  <section class="research-workbench" aria-label="最新经营变化">
    <header><div><span class="eyebrow">经营跟踪</span><h2>单季与半年度经营变化</h2></div><small>最近12期 · 按相同期间同比</small></header>
    <p>金额沿用报表单位（{{ statements?.reportingCurrency ?? '币种未确认' }}）。单季按同财年累计值拆分，下半年用全年减上半年。</p>
    <p v-if="!rows.length" role="status">暂无可可靠拆分的期间。港股旧缓存需刷新以获取财年起始日期；缺少起始日期或前期累计值时不估算。</p>
    <template v-else>
      <div class="operating-controls">
        <div role="group" aria-label="图表指标">
          <button v-for="item in views" :key="item.id" type="button" :aria-pressed="view === item.id" @click="view = item.id">{{ item.label }}</button>
        </div>
        <div role="group" aria-label="统计期间">
          <button type="button" :aria-pressed="months === 3" :disabled="!quarters.length" @click="months = 3">单季</button>
          <button type="button" :aria-pressed="months === 6" :disabled="!halves.length" @click="months = 6">半年度</button>
        </div>
      </div>
      <OperatingChangesChart :rows="rows" :view="view" />
      <div class="operating-signals"><strong>{{ rows[0].label }} · 主要变化</strong><ul v-if="signals.length"><li v-for="signal in signals" :key="signal">{{ signal }}</li></ul><p v-else>当前可比数据不足，请检查下方明细。</p></div>
      <details class="operating-details">
      <summary>经营数据明细</summary>
      <div class="workbench-scroll"><table>
        <thead><tr><th>期间</th><th>收入 / 同比</th><th>归母利润 / 同比</th><th>扣非归母 / 同比</th><th>经营现金流 / 同比</th><th>毛利率 / 同比变化</th><th>归母净利率 / 同比变化</th><th>期间费用率 / 同比变化</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.end"><th>{{ row.label }}</th>
          <td>{{ formatNumber(row.revenue) }}<small>{{ pct(row.revenueYoY) }}</small></td>
          <td>{{ formatNumber(row.profit) }}<small>{{ pct(row.profitYoY) }}</small></td>
          <td>{{ formatNumber(row.deductedProfit) }}<small>{{ pct(row.deductedYoY) }}</small></td>
          <td>{{ formatNumber(row.cash) }}<small>{{ pct(row.cashYoY) }}</small></td>
          <td>{{ pct(row.grossMargin) }}<small>{{ change(row.grossMarginChange) }}</small></td>
          <td>{{ pct(row.netMargin) }}<small>{{ change(row.netMarginChange) }}</small></td>
          <td>{{ pct(row.expenseRatio) }}<small>{{ change(row.expenseRatioChange) }}</small></td>
        </tr></tbody>
      </table></div>
      <p>“—”表示缺失、不可比或同比基数≤0，不按零处理。归母利润不使用合并净利润替代。期间费用率需销售、管理、研发、财务费用齐全；港股费用口径未统一时不计算。</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.operating-controls { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
.operating-controls > div { display: flex; flex-wrap: wrap; gap: 6px; }
.operating-controls button[aria-pressed="true"] { background: #285d9e; border-color: #285d9e; color: white; }
.operating-details { border-top: 1px solid #dce5ee; padding-top: 12px; }
.operating-details summary { color: #285d9e; cursor: pointer; font-size: 13px; font-weight: 600; }
.operating-details .workbench-scroll { margin-top: 12px; }
</style>
