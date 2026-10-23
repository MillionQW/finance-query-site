<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import { Loader2, RefreshCw } from 'lucide-vue-next';
import { getCompanyValuation } from '../services/api';
import type { CompanySearchResult } from '../types/finance';
import type { CompanyValuation } from '../types/company-valuation';

const props = defineProps<{ company: CompanySearchResult | null }>();
const CompanyPeHistoryChart = defineAsyncComponent(() => import('./CompanyPeHistoryChart.vue'));
const activeYears = ref(3);
const valuation = ref<CompanyValuation | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let controller: AbortController | null = null;
const dated = computed(() => valuation.value?.dataDate
  ? Date.now() - Date.parse(`${valuation.value.dataDate}T00:00:00+08:00`) > 7 * 86400_000
  : false);

async function load(refresh = false) {
  controller?.abort();
  const company = props.company;
  if (!company) { valuation.value = null; loading.value = false; error.value = null; return; }
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = null;
  try {
    const result = await getCompanyValuation(company.market, company.symbol, refresh, request.signal);
    if (!request.signal.aborted) valuation.value = result;
  } catch (reason) {
    if (!request.signal.aborted) error.value = reason instanceof Error ? reason.message : '估值数据获取失败';
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}

watch(() => props.company ? `${props.company.market}:${props.company.symbol}` : '', () => {
  valuation.value = null;
  void load();
}, { immediate: true });
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section v-if="company" class="company-valuation-panel" aria-label="PE（TTM）历史分位" :aria-busy="loading">
    <header>
      <div>
        <h2>PE（TTM）历史分位</h2>
        <p>当前估值在公司自身历史中的位置</p>
      </div>
      <button class="ghost-button blue" type="button" :disabled="loading" @click="load(true)">
        <RefreshCw :size="15" :class="{ 'spin-icon': loading }" />{{ loading ? '读取中' : '刷新估值' }}
      </button>
    </header>
    <div v-if="loading && !valuation" class="valuation-status" role="status">
      <Loader2 class="spin-icon" :size="18" />正在读取 PE（TTM）历史数据…
    </div>
    <p v-if="error" class="valuation-warning" role="alert">{{ error }}。可点击“刷新估值”重试。</p>
    <template v-if="valuation">
      <div class="valuation-meta">
        <span>最新 PE（TTM） <strong>{{ valuation.currentPe?.toFixed(2) ?? '—' }}<small v-if="valuation.currentPe !== null"> 倍</small></strong></span>
        <span>数据日期 <strong>{{ valuation.dataDate ?? '—' }}</strong></span>
        <span v-if="valuation.cache.hit" class="valuation-cache">本地缓存</span>
      </div>
      <p v-if="valuation.cache.stale" class="valuation-warning" role="status">更新失败，正在显示上次成功获取的数据，请留意数据日期。</p>
      <p v-else-if="dated" class="valuation-warning">数据日期距今已超过 7 天，分位以该日期为截止日。</p>
      <p v-if="valuation.unavailableReason" class="valuation-warning">{{ valuation.unavailableReason }}</p>
      <div class="valuation-windows" role="group" aria-label="PE 历史区间">
        <button v-for="item in valuation.windows" :key="item.years" type="button" class="valuation-window-card" :class="{ selected: activeYears === item.years }" :aria-label="`近 ${item.years} 年`" :aria-pressed="activeYears === item.years" @click="activeYears = item.years">
          <span class="valuation-window-heading"><strong>近 {{ item.years }} 年</strong><span v-if="!item.historyComplete">历史覆盖不足 {{ item.years }} 年</span></span>
          <strong class="valuation-percentile">{{ item.percentile?.toFixed(2) ?? '—' }}<small v-if="item.percentile !== null">%</small></strong>
          <span class="valuation-track" aria-hidden="true"><i :style="{ width: `${item.percentile ?? 0}%` }"></i></span>
          <span class="valuation-samples">有效样本 <strong>{{ item.sampleCount }}</strong> 条</span>
          <small class="valuation-range">{{ item.firstSampleDate ?? '—' }} 至 {{ item.lastSampleDate ?? '—' }}</small>
          <small v-if="item.sampleCount < 2" class="valuation-warning">有效样本不足 2 条，暂不计算分位</small>
        </button>
      </div>
      <CompanyPeHistoryChart :valuation="valuation" :years="activeYears" />
      <details class="valuation-method">
        <summary>计算口径与数据来源</summary>
        <p>分位 = 区间内 PE（TTM）小于或等于最新值的有效样本数 ÷ 有效样本总数。区间以数据日期为截止日，包含最新样本；同日去重，剔除缺失、非有限数及非正 PE。</p>
        <p>数据源提供历史抽样记录，非逐交易日序列。历史覆盖不足时按实际样本计算，不能视为所选年限的完整历史分位；最新 PE 无效时不计算分位。</p>
        <p>来源：{{ valuation.source }} · 获取时间：{{ new Date(valuation.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}（北京时间）</p>
      </details>
      <p class="valuation-footnote">按历史抽样记录计算，有效样本数不等于交易日数。分位越低，代表当前 PE 在该区间历史样本中越低。</p>
    </template>
  </section>
</template>

<style scoped>
.company-valuation-panel { margin: 16px 0; padding: 24px; border: 1px solid #dce5ee; border-radius: 16px; background: #fff; color: #223449; }
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
h2 { margin: 0; font-size: 18px; }
header p, .valuation-footnote { margin: 8px 0 0; color: #65788b; font-size: 12px; line-height: 1.7; }
.valuation-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 28px; margin: 20px 0; font-size: 13px; color: #65788b; }
.valuation-meta strong { margin-left: 8px; color: #223449; font-size: 16px; }
.valuation-meta small { font-size: 12px; font-weight: 400; }
.valuation-cache { padding: 3px 8px; border-radius: 5px; background: #eff4f9; font-size: 11px; }
.valuation-windows { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.valuation-window-card { padding: 18px; background: #f7f9fc; border: 1px solid #e5ebf2; border-radius: 12px; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.valuation-window-card.selected { border-color: #5384c4; background: #f0f6ff; box-shadow: inset 0 0 0 1px #5384c4; }
.valuation-window-card:hover { border-color: #5384c4; }
.valuation-window-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.valuation-window-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.valuation-window-heading > strong { font-size: 14px; }
.valuation-window-heading span { font-size: 11px; color: #996b20; }
.valuation-percentile { display: block; margin: 14px 0; font-size: 30px; color: #326bb2; font-variant-numeric: tabular-nums; }
.valuation-percentile small { font-size: 16px; margin-left: 3px; }
.valuation-track { display: block; height: 6px; border-radius: 6px; overflow: hidden; background: #e1e8f0; }
.valuation-track i { display: block; height: 100%; background: #5384c4; border-radius: inherit; }
.valuation-samples { display: block; margin: 16px 0 6px; font-size: 12px; color: #65788b; }
.valuation-samples strong { color: #223449; }
.valuation-range { display: block; color: #65788b; font-size: 11px; }
.valuation-method { margin-top: 18px; font-size: 12px; color: #65788b; line-height: 1.8; overflow-wrap: anywhere; }
summary { cursor: pointer; color: #326bb2; }
.valuation-warning { color: #94651d; font-size: 12px; line-height: 1.7; }
.valuation-status { display: flex; gap: 10px; align-items: center; margin-top: 22px; font-size: 13px; color: #65788b; }
@media (max-width: 700px) {
  .company-valuation-panel { padding: 16px; }
  .valuation-windows { grid-template-columns: 1fr; gap: 10px; }
  header { align-items: flex-start; }
}
</style>
