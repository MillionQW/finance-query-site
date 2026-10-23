<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { BusinessData,HypothesisData,ResearchEntry } from '../types/research-tracking';
import type { ValuationSnapshot } from '../finance/scenario-valuation';
import { emptyHypothesis,hypothesisErrors,hypothesisState,researchNumber as num } from '../finance/research-tracking';
import ResearchMetricFields from './ResearchMetricFields.vue';
const props = defineProps<{
  entries:ResearchEntry<HypothesisData>[]; business:ResearchEntry<BusinessData>[]; valuations:ValuationSnapshot[];
  seed:{ serial:number; data:BusinessData }|null;
  save:(data:HypothesisData,id:string|null,version:number)=>Promise<boolean>;
  review:(id:string,input:{expectedVersion:number;businessId:string;businessVersion:number;note:string;valuationImpact:string})=>Promise<boolean>;
}>();
const emit=defineEmits<{history:[id:string]}>();
const editing=ref(false),draft=ref(emptyHypothesis()),editingId=ref<string|null>(null),version=ref(0),validation=ref<string[]>([]);
const filter=ref('active');
const today=ref(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}));
const clock=window.setInterval(()=>{today.value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});},60000);
onBeforeUnmount(()=>window.clearInterval(clock));
const items=computed(()=>props.entries.map(e=>({...e,state:hypothesisState(e.data,props.business,today.value)})));
const visible=computed(()=>items.value.filter(e=>filter.value==='all'||filter.value==='attention'&&e.state.attention||filter.value==='active'&&!e.data.archived));
const attentionCount=computed(()=>items.value.filter(e=>e.state.attention).length);
const reviewId=ref<string|null>(null), reviewVersion=ref(0),reviewActual=ref<{id:string;version:number;value:number}|null>(null),reviewNote=ref(''),valuationImpact=ref('');
function edit(entry?:ResearchEntry<HypothesisData>) {
  draft.value=entry?JSON.parse(JSON.stringify(entry.data)):emptyHypothesis(); editingId.value=entry?.id??null;version.value=entry?.version??0;
  validation.value=[]; editing.value=true; reviewId.value=null;
}
watch(()=>props.seed,seed=>{if(seed){edit();draft.value=emptyHypothesis(seed.data);}}, {flush:'post'});
function bound(which:'expectedMin'|'expectedMax',event:Event){const raw=(event.target as HTMLInputElement).value;draft.value[which]=raw===''?null:Number(raw);}
async function submit(){validation.value=hypothesisErrors(draft.value);if(validation.value.length)return;if(await props.save(draft.value,editingId.value,version.value))editing.value=false;}
async function archive(entry:ResearchEntry<HypothesisData>){await props.save({...entry.data,archived:!entry.data.archived},entry.id,entry.version);}
function startReview(entry:typeof items.value[number]) {
  const actual=entry.state.actual;if(!actual)return;
  reviewId.value=entry.id;reviewVersion.value=entry.version;reviewActual.value={id:actual.id,version:actual.version,value:actual.data.value};
  reviewNote.value='';valuationImpact.value='';editing.value=false;
}
async function submitReview(){
  if(!reviewId.value||!reviewActual.value)return;
  if(await props.review(reviewId.value,{expectedVersion:reviewVersion.value,businessId:reviewActual.value.id,businessVersion:reviewActual.value.version,note:reviewNote.value,valuationImpact:valuationImpact.value}))reviewId.value=null;
}
</script>
<template>
  <section class="research-workbench" aria-label="研究假设跟踪">
    <header><div><span class="eyebrow">假设 → 数据 → 验证 → 估值</span><h2>研究假设跟踪</h2></div><button type="button" @click="edit()">新增研究假设</button></header>
    <p>把判断关联到一个明确的经营指标、目标期间和预期范围。录入匹配数据后自动提示达标或偏离，验证结论由你记录；指标达标不等于整条投资逻辑成立。</p>
    <div class="tracking-summary"><strong>{{ entries.filter(e=>!e.data.archived).length }} 条在跟踪</strong><strong>{{ attentionCount }} 条需关注</strong><label>筛选假设<select v-model="filter"><option value="active">进行中</option><option value="attention">需关注</option><option value="all">全部（含归档）</option></select></label></div>
    <form v-if="editing" class="tracking-editor" @submit.prevent="submit">
      <h3>{{editingId?'修订研究假设':'建立可验证的假设'}}</h3>
      <label>研究假设<textarea v-model="draft.thesis" rows="2" maxlength="1000" required placeholder="例如：高端产品保持定价能力，毛利率不低于45%" /></label>
      <ResearchMetricFields :model="draft" prefix="hypothesis" />
      <div class="workbench-fields">
        <label>预期下限（含）<input :value="draft.expectedMin" type="number" step="any" @input="bound('expectedMin',$event)" /></label>
        <label>预期上限（含）<input :value="draft.expectedMax" type="number" step="any" @input="bound('expectedMax',$event)" /></label>
        <label>计划验证日期<input v-model="draft.dueDate" type="date" required /></label>
        <label>关联估值快照<select v-model="draft.valuationSnapshotId"><option :value="null">暂不关联</option><option v-if="draft.valuationSnapshotId&&!valuations.some(v=>v.id===draft.valuationSnapshotId)" :value="draft.valuationSnapshotId">历史快照 #{{draft.valuationSnapshotId}}</option><option v-for="v in valuations" :key="v.id" :value="v.id">#{{v.id}} · {{v.model.basePeriod}} · {{v.model.valuationDate}}</option></select></label>
      </div>
      <label>假设依据／证据来源<textarea v-model="draft.rationale" rows="3" maxlength="4000" required placeholder="为什么设置这个范围？列出报告页码、经营事实或待验证因素。" /></label>
      <p>范围单位使用上方指标单位；留空的一侧表示不设边界。为保证可比性，目标期间及全部口径字段必须与经营记录一致。修改假设后需要重新验证。</p>
      <ul v-if="validation.length" class="workbench-error" role="alert"><li v-for="e in validation" :key="e">{{e}}</li></ul>
      <div class="workbench-actions"><button type="submit">保存研究假设</button><button type="button" @click="editing=false">取消编辑</button></div>
    </form>
    <p v-if="!visible.length">当前没有符合筛选条件的假设。可从业务记录点击“建立假设”，或直接新增指标与目标。</p>
    <article v-for="entry in visible" :key="entry.id" class="tracking-hypothesis" :class="{attention:entry.state.attention,'tracking-archived':entry.data.archived}">
      <header><h3>{{entry.data.thesis}}</h3><strong class="tracking-status">{{entry.state.label}}</strong></header>
      <p>{{entry.data.dimension}} · {{entry.data.segment}} · {{entry.data.metric}} · {{entry.data.basis}}<br />目标期间 {{entry.data.periodStart}} — {{entry.data.periodEnd}} · 验证日期 {{entry.data.dueDate}}</p>
      <div class="tracking-summary"><span>预期：{{entry.data.expectedMin===null?'不设下限':num(entry.data.expectedMin)}} 至 {{entry.data.expectedMax===null?'不设上限':num(entry.data.expectedMax)}} {{entry.data.unit}} {{entry.data.currency}}</span><strong>实际：{{num(entry.state.actual?.data.value)}} {{entry.data.unit}}</strong></div>
      <p v-if="entry.state.actual">依据：{{entry.state.actual.data.sourceText}} · {{entry.state.actual.data.page}} · 数据版本 {{entry.state.actual.version}}</p>
      <p v-else>尚无严格匹配的目标期间数据，不使用上一期数值代替。</p>
      <details><summary>假设依据{{entry.data.valuationSnapshotId?` · 关联估值快照 #${entry.data.valuationSnapshotId}`:''}}</summary><p>{{entry.data.rationale}}</p></details>
      <div v-if="entry.data.review" class="tracking-last-review"><strong>上次验证：{{entry.data.review.outcome==='met'?'指标达标':'指标偏离'}} · 当时实际值 {{num(entry.data.review.actual)}}</strong><p>{{entry.data.review.note}}</p><p>估值影响：{{entry.data.review.valuationImpact}}</p><small>{{new Date(entry.data.review.reviewedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}}（北京时间） · 经营数据版本 {{entry.data.review.businessVersion}}</small></div>
      <form v-if="reviewId===entry.id" class="tracking-editor" @submit.prevent="submitReview">
        <strong>本次核验数值 {{num(reviewActual?.value)}} {{entry.data.unit}} · 数据版本 {{reviewActual?.version}}</strong>
        <label>验证结论与原因<textarea v-model="reviewNote" rows="2" required maxlength="4000" /></label>
        <label>对估值／投资逻辑的影响<textarea v-model="valuationImpact" rows="2" required maxlength="4000" placeholder="是否需要调整增长、利润率或估值倍数？也可记录维持原判断的原因。" /></label>
        <div class="workbench-actions"><button type="submit">记录本次验证</button><button type="button" @click="reviewId=null">取消验证</button></div>
      </form>
      <div class="tracking-row-actions"><button type="button" :disabled="entry.data.archived||!entry.state.actual" @click="startReview(entry)">验证假设</button><button type="button" @click="edit(entry)">编辑假设</button><button type="button" @click="emit('history',entry.id)">查看历史</button><button type="button" @click="archive(entry)">{{entry.data.archived?'恢复跟踪':'归档假设'}}</button></div>
    </article>
  </section>
</template>
