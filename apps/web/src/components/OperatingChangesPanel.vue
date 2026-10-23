<script setup lang="ts">
import { computed } from 'vue';
import type { FinancialStatements } from '../types/finance';
import { buildOperatingPeriods, operatingSignals } from '../finance/operating-periods';
import { formatNumber } from '../app/app-formatters';
const props = defineProps<{ statements: FinancialStatements | null }>();
const rows = computed(() => buildOperatingPeriods(props.statements));
const signals = computed(() => operatingSignals(rows.value));
const pct = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const change = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}个百分点`;
</script>
<template>
  <section class="research-workbench" aria-label="最新经营变化">
    <header><div><span class="eyebrow">经营跟踪</span><h2>单季与半年度经营变化</h2></div><small>最近12期 · 按相同期间同比</small></header>
    <p>金额沿用报表单位（{{ statements?.reportingCurrency ?? '币种未确认' }}）；季度来自同财年累计差额。仅披露半年数据时展示半年，资产负债表不作差分。</p>
    <p v-if="!rows.length" role="status">暂无可可靠拆分的期间。港股旧缓存需刷新以获取财年起始日期；缺少起始日期或前期累计值时不估算。</p>
    <template v-else>
      <div class="operating-signals"><strong>{{ rows[0].label }} · 主要变化</strong><ul v-if="signals.length"><li v-for="signal in signals" :key="signal">{{ signal }}</li></ul><p v-else>当前可比数据不足，请检查下方明细。</p></div>
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
    </template>
  </section>
</template>
