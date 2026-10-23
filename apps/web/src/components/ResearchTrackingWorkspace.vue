<script setup lang="ts">
import { onBeforeUnmount,ref } from 'vue';
import type { CompanySearchResult } from '../types/finance';
import type { BusinessData,BusinessSyncStatus,HypothesisData,ResearchEntry,ResearchKind,TrackingState } from '../types/research-tracking';
import type { ValuationSnapshot } from '../finance/scenario-valuation';
import { getValuationModels } from '../services/api';
import { getResearchTracking,getResearchHistory,saveResearchEntry,reviewHypothesis,syncBusinessData } from '../services/research-tracking';
import BusinessDataPanel from './BusinessDataPanel.vue';
import HypothesisTrackingPanel from './HypothesisTrackingPanel.vue';
import ResearchTrackingHistory from './ResearchTrackingHistory.vue';
const props=defineProps<{company:CompanySearchResult}>();
const state=ref<TrackingState>({business:[],hypotheses:[]}), valuations=ref<ValuationSnapshot[]>([]);
const loading=ref(true),busy=ref(false),error=ref(''),message=ref('');
const syncing=ref(false), syncStatus=ref<BusinessSyncStatus|null>(null);
const seed=ref<{serial:number;data:BusinessData}|null>(null),history=ref<ResearchEntry<BusinessData|HypothesisData>[]>([]),historyTitle=ref('');
const controller=new AbortController();let alive=true;let historyRequest=0;
onBeforeUnmount(()=>{alive=false;controller.abort();});
async function load(){
  loading.value=true;error.value='';
  const results=await Promise.allSettled([getResearchTracking(props.company,controller.signal),getValuationModels(props.company.market,props.company.symbol,controller.signal)]);
  if(!alive)return;
  if(results[0].status==='fulfilled')state.value=results[0].value;else error.value=`研究记录读取失败：${String(results[0].reason)}`;
  if(results[1].status==='fulfilled')valuations.value=results[1].value;else error.value+=' 估值快照读取失败，可重新载入。';
  loading.value=false;
}
async function action(work:()=>Promise<void>){
  if(busy.value||syncing.value)return false;busy.value=true;error.value='';message.value='';
  try {await work();if(!alive)return false;message.value='已保存到本地数据库，历史版本保留。';history.value=[];return true;}
  catch(e){if(alive)error.value=e instanceof Error?e.message:String(e);return false;}
  finally{if(alive)busy.value=false;}
}
async function saveBusiness(data:BusinessData,id:string|null,version:number){
  return action(async()=>{const saved=await saveResearchEntry(props.company,'business',JSON.parse(JSON.stringify(data)),id,version);if(alive)state.value.business=[saved,...state.value.business.filter(e=>e.id!==saved.id)];});
}
async function saveHypothesis(data:HypothesisData,id:string|null,version:number){
  return action(async()=>{const saved=await saveResearchEntry(props.company,'hypotheses',JSON.parse(JSON.stringify(data)),id,version);if(alive)state.value.hypotheses=[saved,...state.value.hypotheses.filter(e=>e.id!==saved.id)];});
}
async function review(id:string,input:{expectedVersion:number;businessId:string;businessVersion:number;note:string;valuationImpact:string}){
  return action(async()=>{const saved=await reviewHypothesis(props.company,id,input);if(alive)state.value.hypotheses=[saved,...state.value.hypotheses.filter(e=>e.id!==id)];});
}
async function showHistory(kind:ResearchKind,id:string){
  const request=++historyRequest;
  try{const rows=await getResearchHistory(props.company,kind,id,controller.signal);if(alive&&request===historyRequest){history.value=rows;historyTitle.value=kind==='business'?'经营数据':'研究假设';}}
  catch(e){if(alive)error.value=e instanceof Error?e.message:String(e);}
}
function startHypothesis(data:BusinessData){seed.value={serial:(seed.value?.serial??0)+1,data};}
async function syncBusiness(refresh=false){
  if(syncing.value||busy.value)return;
  syncing.value=true;
  try {const result=await syncBusinessData(props.company,refresh,controller.signal);if(alive){state.value=result.state;syncStatus.value=result.sync;}}
  catch(e){if(alive)error.value=`自动抓取未完成，原有数据保留：${e instanceof Error?e.message:String(e)}`;}
  finally {if(alive)syncing.value=false;}
}
void load().then(()=>{if(alive)void syncBusiness();});
</script>
<template>
  <div class="research-tracking-workspace">
    <div class="workbench-actions"><button type="button" :disabled="loading||busy||syncing" @click="load">重新载入研究记录与估值快照</button><button type="button" :disabled="loading||busy||syncing||company.market==='hk'" @click="syncBusiness(true)">刷新自动业务数据</button><span v-if="loading" role="status">正在读取研究记录…</span><span v-if="syncing" role="status">正在自动抓取分业务披露…</span><span v-if="busy" role="status">保存中…</span><span v-if="message" role="status">{{message}}</span></div>
    <div v-if="syncStatus" class="tracking-sync-status" role="status">
      <p>{{syncStatus.message}}</p>
      <p v-if="syncStatus.status!=='unsupported'">最近尝试：{{new Date(syncStatus.attemptedAt).toLocaleString('zh-CN')}} · 最近成功：{{syncStatus.lastSuccessAt?new Date(syncStatus.lastSuccessAt).toLocaleString('zh-CN'):'尚无'}}<br />最近一次同步新增 {{syncStatus.added}} 项、修订 {{syncStatus.updated}} 项；保护手工修改／归档 {{syncStatus.protected}} 项，源中缺失 {{syncStatus.missing}} 项，跳过异常 {{syncStatus.skipped}} 项。</p>
    </div>
    <p v-if="error" class="tracking-error" role="alert">{{error}}</p>
    <fieldset v-if="!loading" :disabled="busy||syncing" class="tracking-fieldset">
      <BusinessDataPanel :entries="state.business" :save="saveBusiness" @hypothesis="startHypothesis" @history="showHistory('business',$event)" />
      <HypothesisTrackingPanel :entries="state.hypotheses" :business="state.business" :valuations="valuations" :seed="seed" :save="saveHypothesis" :review="review" @history="showHistory('hypotheses',$event)" />
      <ResearchTrackingHistory v-if="history.length" :entries="history" :title="historyTitle" @close="history=[]" />
    </fieldset>
  </div>
</template>
