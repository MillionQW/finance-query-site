<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BusinessData, ResearchEntry } from '../types/research-tracking';
import { businessComparison,businessErrors,emptyBusiness,researchNumber as num,researchPercent as pct,dimensions } from '../finance/research-tracking';
import ResearchMetricFields from './ResearchMetricFields.vue';
import BusinessProvenance from './BusinessProvenance.vue';
const props = defineProps<{ entries: ResearchEntry<BusinessData>[]; save: (data:BusinessData,id:string|null,version:number)=>Promise<boolean> }>();
const emit = defineEmits<{ hypothesis:[data:BusinessData]; history:[id:string] }>();
const editing = ref(false), draft = ref(emptyBusiness()), editingId = ref<string|null>(null), version = ref(0), validation = ref<string[]>([]);
const period = ref(''), dimension = ref('全部'), showArchived = ref(false);
const periods = computed(() => [...new Set(props.entries.filter(e => showArchived.value || !e.data.archived).map(e=>`${e.data.periodStart} / ${e.data.periodEnd}`))].sort().reverse());
const selectedPeriod = computed(() => period.value || periods.value[0] || '');
const visible = computed(() => props.entries.filter(e => (showArchived.value || !e.data.archived) && (!selectedPeriod.value || `${e.data.periodStart} / ${e.data.periodEnd}` === selectedPeriod.value) && (dimension.value === '全部' || e.data.dimension === dimension.value))
  .map(e => ({ ...e, comparison:businessComparison(e,props.entries) })).sort((a,b)=>a.data.segment.localeCompare(b.data.segment)||a.data.metric.localeCompare(b.data.metric)));
function edit(entry?: ResearchEntry<BusinessData>, copy = false) {
  draft.value = entry ? JSON.parse(JSON.stringify(entry.data)) : emptyBusiness();
  editingId.value = copy ? null : entry?.id ?? null; version.value = copy ? 0 : entry?.version ?? 0;
  if(copy) { draft.value.periodStart='';draft.value.periodEnd='';draft.value.archived=false; }
  validation.value=[]; editing.value=true;
}
async function submit() {
  validation.value=businessErrors(draft.value); if(validation.value.length) return;
  if(await props.save({...draft.value,value:draft.value.value!},editingId.value,version.value)) { period.value=`${draft.value.periodStart} / ${draft.value.periodEnd}`;editing.value=false; }
}
async function archive(entry:ResearchEntry<BusinessData>) { await props.save({...entry.data,archived:!entry.data.archived},entry.id,entry.version); }
</script>
<template>
  <section class="research-workbench" aria-label="分业务经营数据">
    <header><div><span class="eyebrow">业务拆解 · 原始证据</span><h2>分业务经营数据</h2></div><button type="button" @click="edit()">录入业务数据</button></header>
    <p>A股进入页面后自动同步产品、行业与地区的主营构成，24小时内复用缓存，可点击“刷新自动业务数据”重抓。收入、成本、主营利润和比例保留来源原字段；渠道、销量等未覆盖指标仍可补录。百分比按显示值录入（例如毛利率45%填45），未披露项目不记为零。</p>
    <form v-if="editing" class="tracking-editor" @submit.prevent="submit">
      <h3>{{ editingId ? '修订业务数据' : '新增业务数据' }}</h3>
      <p v-if="draft.origin">保存人工修订后，此记录受保护，后续自动刷新不会覆盖；原始抓取证据仍保留。</p>
      <ResearchMetricFields :model="draft" prefix="business" />
      <div class="workbench-fields">
        <label>披露数值<input :value="draft.value" type="number" step="any" required @input="draft.value=($event.target as HTMLInputElement).value===''?null:Number(($event.target as HTMLInputElement).value)" /></label>
        <label>报告名称／来源<input v-model="draft.sourceText" maxlength="2000" required placeholder="例如：2025年年报，分部资料" /></label>
        <label>原报告链接（选填）<input v-model="draft.sourceUrl" type="url" maxlength="2000" /></label>
        <label>页码／附注位置<input v-model="draft.page" maxlength="100" placeholder="第85页，附注6" /></label>
      </div>
      <label>说明与调整记录<textarea v-model="draft.note" rows="2" maxlength="4000" placeholder="是否含内部交易、分部重分类、口径调整等" /></label>
      <ul v-if="validation.length" class="workbench-error" role="alert"><li v-for="e in validation" :key="e">{{ e }}</li></ul>
      <div class="workbench-actions"><button type="submit">保存业务数据</button><button type="button" @click="editing=false">取消编辑</button></div>
    </form>
    <div class="workbench-fields tracking-filters">
      <label>查看报告期<select v-model="period"><option value="">最新报告期</option><option v-for="p in periods" :key="p">{{ p }}</option></select></label>
      <label>查看拆分维度<select v-model="dimension"><option>全部</option><option v-for="d in dimensions" :key="d">{{ d }}</option></select></label>
      <label class="tracking-checkbox"><input v-model="showArchived" type="checkbox" />显示归档记录</label>
    </div>
    <p v-if="!visible.length">当前期间没有可用业务数据。自动抓取状态见上方，也可根据报告补录。同比需要两个相同口径的年度／半年度报告。</p>
    <div v-else class="workbench-scroll"><table>
      <thead><tr><th>分部 / 指标</th><th>披露值</th><th>上年同期 / 变化</th><th>占整体比例</th><th>分部毛利率</th><th>来源与口径</th><th>操作</th></tr></thead>
      <tbody><tr v-for="entry in visible" :key="entry.id" :class="{ 'tracking-archived':entry.data.archived }">
        <th>{{ entry.data.segment }}<small>{{ entry.data.dimension }} · {{ entry.data.metric }}{{ entry.data.archived ? ' · 已归档' : '' }}{{entry.data.origin?.missing?' · 源中缺失':''}}</small></th>
        <td>{{ num(entry.data.value) }} {{ entry.data.unit }}<small>{{ entry.data.currency }}</small></td>
        <td>{{ num(entry.comparison.previous) }}<small>{{ entry.data.unit === '%' ? `${num(entry.comparison.ppChange)} 个百分点` : pct(entry.comparison.growth) }}</small></td>
        <td>{{ pct(entry.comparison.share) }}</td><td>{{ pct(entry.comparison.grossMargin) }}</td>
        <td class="tracking-source"><a v-if="entry.data.sourceUrl" :href="entry.data.sourceUrl" target="_blank" rel="noopener noreferrer">{{ entry.data.sourceText }}</a><span v-else>{{ entry.data.sourceText }}</span><small>{{ entry.data.page }} · {{ entry.data.basis }}</small><details v-if="entry.data.note"><summary>口径说明</summary><small>{{ entry.data.note }}</small></details><BusinessProvenance v-if="entry.data.origin" :origin="entry.data.origin" /></td>
        <td><div class="tracking-row-actions"><button type="button" @click="edit(entry)">编辑</button><button type="button" @click="edit(entry,true)">复制到新期间</button><button type="button" :disabled="entry.data.archived" @click="emit('hypothesis',entry.data)">建立假设</button><button type="button" @click="emit('history',entry.id)">历史</button><button type="button" @click="archive(entry)">{{ entry.data.archived ? '恢复' : '归档' }}</button></div></td>
      </tr></tbody>
    </table></div>
    <p>同比只比较同起止期间、同币种、同单位、同口径；比例指标显示百分点变化。占比以单独录入的“公司整体”同指标为分母，不把部分分部之和当作公司总额；毛利率仅在同口径收入与毛利齐全时计算。</p>
  </section>
</template>
