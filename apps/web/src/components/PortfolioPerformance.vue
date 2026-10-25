<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import PerformanceEditor from './PerformanceEditor.vue';
import { deletePerformance, getPerformance } from '../services/performance';
import type { PerformanceEntry, PerformanceInput, PerformanceState } from '../types/performance';
import '../styles/performance.css';

const state = ref<PerformanceState | null>(null), loading = ref(true), busy = ref(false), error = ref(''), notice = ref('');
const editor = ref<{ kind: PerformanceInput['kind']; entry: PerformanceEntry | null } | null>(null);
const removing = ref<string | null>(null);
const abort = new AbortController();
const result = computed(() => state.value?.result);
const entries = computed(() => [...(state.value?.entries ?? [])].sort((a, b) => b.at.localeCompare(a.at)));
const initialized = computed(() => state.value?.entries.some(e => e.kind === 'initial'));
const labels = { initial: '起始资产', snapshot: '资产快照', deposit: '资金转入', withdrawal: '资金取出' };
const money = (n: number | null | undefined, digits = 2) => n == null ? '—' : n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (n: number | null | undefined) => n == null ? '—' : `${n > 0 ? '+' : ''}${money(n * 100)}%`;
async function load() {
  loading.value = true; error.value = '';
  try { state.value = await getPerformance(abort.signal); }
  catch (e) { if (!abort.signal.aborted) error.value = e instanceof Error ? e.message : '收益记录读取失败'; }
  finally { loading.value = false; }
}
function saved(value: PerformanceState) { state.value = value; editor.value = null; error.value = ''; notice.value = '收益记录已保存，已重新计算'; }
async function remove(entry: PerformanceEntry) {
  if (!state.value) return;
  busy.value = true; error.value = '';
  try { state.value = await deletePerformance(entry.id, state.value.version); removing.value = null; notice.value = '已删除记录并重新计算'; }
  catch (e) { error.value = e instanceof Error ? e.message : '删除失败'; }
  finally { busy.value = false; }
}
onMounted(load);
onUnmounted(() => abort.abort());
</script>

<template>
  <section class="performance-panel portfolio-card" aria-label="账户收益统计">
    <header class="performance-heading"><div><span class="portfolio-eyebrow">账户资产快照 ＋ 出入金流水</span><h2>收益统计</h2>
      <p v-if="state">起算日 {{ state.startDate }} · 人民币口径 · 截至 {{ result?.asOf?.replace('T', ' ') || '尚未设置起始资产' }}（北京时间）</p></div>
      <button :disabled="loading || busy" @click="load">重新载入收益</button></header>
    <p v-if="error" role="alert" class="portfolio-error">{{ error }}</p>
    <p v-if="notice" role="status" class="portfolio-notice">{{ notice }}</p>
    <p v-if="loading">正在读取收益记录…</p>
    <div v-else-if="state && !initialized" class="performance-empty"><strong>从起始账户净资产开始</strong>
      <p>请填写 {{ state.startDate }} 的起始账户净资产，包含持仓、现金并扣除负债。持仓表中的金额不会自动作为账户总资产。</p>
      <button class="portfolio-primary" @click="editor = { kind: 'initial', entry: null }">设置起始资产</button></div>
    <template v-if="initialized && result">
      <div class="performance-metrics">
        <div><span>基金净值法 · 累计收益率</span><strong data-testid="performance-twr">{{ percent(result.twr) }}</strong><p>单位净值 {{ money(result.nav, 6) }} · 初始值 1</p><small v-if="result.twrReason">{{ result.twrReason }}</small></div>
        <div><span>XIRR · 年化收益率</span><strong data-testid="performance-xirr">{{ percent(result.xirr) }}</strong><p>按实际投入金额和日期计算</p><small v-if="result.xirrReason">{{ result.xirrReason }}</small><small v-else-if="result.days < 365">记录不足一年，此数为年化结果，不是期间实际涨幅。</small></div>
        <div><span>累计盈亏（人民币元）</span><strong data-testid="performance-profit">{{ money(result.profit) }}</strong><p>最新资产 − 起始资产 − 净转入</p></div>
      </div>
      <div class="performance-totals"><span>起始资产 {{ money(result.initialValue) }} 元</span><span>最新净资产 {{ money(result.endingValue) }} 元</span><span>期间净转入 {{ money(result.netContributions) }} 元</span></div>
      <div class="performance-actions"><button class="portfolio-primary" @click="editor = { kind: 'snapshot', entry: null }">添加资产快照</button>
        <button @click="editor = { kind: 'deposit', entry: null }">记录转入资金</button><button @click="editor = { kind: 'withdrawal', entry: null }">记录取出资金</button></div>
      <p class="performance-note">收益截至最后一条记录，不随行情刷新自动变化。录入快照前请补齐此前全部出入金；买卖股票和留在账户里的分红无需登记为出入金。</p>
      <details class="performance-records"><summary>资产与流水记录（{{ entries.length }}条）</summary><div class="portfolio-table-scroll"><table class="portfolio-table performance-table">
        <thead><tr><th>时间（北京时间）</th><th>类型</th><th>金额</th><th>折合人民币 / 汇率</th><th>转账前净资产</th><th>备注</th><th>操作</th></tr></thead>
        <tbody><tr v-for="entry in entries" :key="entry.id"><td>{{ entry.at.replace('T', ' ') }}</td><td>{{ labels[entry.kind] }}</td>
          <td>{{ money(entry.amount) }} {{ entry.currency }}</td><td>{{ money(entry.amount * entry.fx) }} 元<small v-if="entry.currency === 'HKD'">1 HKD = {{ entry.fx }} CNY</small></td>
          <td>{{ entry.kind === 'deposit' || entry.kind === 'withdrawal' ? money(entry.beforeValue) : '—' }}</td><td>{{ entry.note || '—' }}</td>
          <td><div class="portfolio-row-actions"><button :disabled="busy" @click="editor = { kind: entry.kind, entry }">编辑记录</button><button :disabled="busy" @click="removing = entry.id">删除记录</button></div>
            <div v-if="removing === entry.id" class="portfolio-delete"><small>删除后重新计算收益？</small><button :disabled="busy" @click="remove(entry)">确认删除记录</button><button :disabled="busy" @click="removing = null">取消</button></div></td></tr></tbody>
      </table></div></details>
    </template>
    <details class="performance-method"><summary>计算口径与录入说明</summary>
      <p>统计范围应始终一致。账户净资产包括全部持仓与现金，扣除相关负债；资产快照统一折合人民币。账户内买卖、换汇、分红到账和统计范围内账户互转都不是外部出入金。税费已体现在净资产中，不再重复扣除。</p>
      <p>基金净值法：起始份额等于起始净资产、净值为1。每笔出入金按转账前净值增减份额，单位净值=净资产÷份额，累计收益=当前净值−1。出入金缺少转账前净资产时不计算，补齐后恢复。</p>
      <p>XIRR：起始资产、转入记为负现金流，取出和最后净资产记为正现金流，按实际日数/365求解年化收益率。同日流水合并，未跨日期、未找到可靠解或检测到多个解时不显示数值。净资产归零且无任何回款时表示亏损100%。</p>
      <p>港币流水填写当日采用的汇率并随记录保存，不用今天的汇率改写历史。资产快照请按该快照日口径自行折算。所有收益以完整、准确的手工记录为前提。</p>
    </details>
    <PerformanceEditor v-if="editor && state" :state="state" :kind="editor.kind" :entry="editor.entry" @close="editor = null" @saved="saved" />
  </section>
</template>
