import assert from 'node:assert/strict';
import test from 'node:test';
import { businessComparison,hypothesisState,emptyHypothesis,businessErrors,emptyBusiness } from './research-tracking';
import type { BusinessData,ResearchEntry } from '../types/research-tracking';
const base:BusinessData={dimension:'业务',segment:'产品A',metric:'收入',unit:'亿元',currency:'CNY',basis:'对外收入',periodStart:'2025-01-01',periodEnd:'2025-12-31',value:120,sourceText:'年报',sourceUrl:'',page:'50',note:'',archived:false};
const entry=(data:Partial<BusinessData>={},id='1'):ResearchEntry<BusinessData>=>({id,version:1,updatedAt:'2026-01-01',data:{...base,...data}});
test('business comparison uses exact prior-year scope and company totals, not a partial segment sum',()=>{
  const current=entry(),prior=entry({periodStart:'2024-01-01',periodEnd:'2024-12-31',value:100},'2');
  const total=entry({dimension:'整体',segment:'公司整体',value:300},'3'),gross=entry({metric:'毛利',value:48},'4');
  const result=businessComparison(current,[current,prior,total,gross]);
  assert.ok(Math.abs(result.growth!-.2)<1e-12);assert.equal(result.share,.4);assert.equal(result.grossMargin,.4);
  assert.equal(businessComparison(current,[current,prior,gross]).share,null);
  assert.equal(businessComparison(current,[current,{...prior,data:{...prior.data,currency:'HKD'}}]).growth,null);
});
test('percentage metrics show percentage-point changes and nonpositive bases have no ordinary growth',()=>{
  const current=entry({metric:'毛利率',unit:'%',currency:'',value:45});
  const prior=entry({metric:'毛利率',unit:'%',currency:'',periodStart:'2024-01-01',periodEnd:'2024-12-31',value:40},'2');
  assert.equal(businessComparison(current,[current,prior]).ppChange,5);
  assert.equal(businessComparison(current,[current,prior]).growth,null);
  const loss=entry({periodStart:'2024-01-01',periodEnd:'2024-12-31',value:-10},'3');
  assert.equal(businessComparison(entry(),[entry(),loss]).growth,null);
});
test('hypothesis assessment distinguishes missing, overdue, met, deviation, revision and archive',()=>{
  const h={...emptyHypothesis(base),expectedMin:120,expectedMax:150,dueDate:'2026-04-30'};
  assert.equal(hypothesisState(h,[],'2026-04-01').label,'待数据');
  assert.equal(hypothesisState(h,[],'2026-05-01').label,'已到期·待数据');
  assert.equal(hypothesisState(h,[entry()],'2026-05-01').met,true);
  assert.equal(hypothesisState(h,[entry({value:110})],'2026-05-01').met,false);
  const reviewed={...h,review:{businessId:'1',businessVersion:1,actual:120,outcome:'met' as const,reviewedAt:'',note:'test',valuationImpact:'test'}};
  assert.equal(hypothesisState(reviewed,[{...entry(),version:2}],'2026-05-01').revised,true);
  assert.equal(hypothesisState(reviewed,[],'2026-05-01').revised,true);
  assert.equal(hypothesisState({...reviewed,archived:true},[],'2026-05-01').attention,false);
});
test('new business records have no invented zero and missing evidence blocks saving',()=>{
  const draft=emptyBusiness();assert.equal(draft.value,null);assert.ok(businessErrors(draft).length);
  assert.deepEqual(businessErrors({...base,value:0}),[]);
});
test('source-missing observations remain visible but cannot drive comparisons or verify hypotheses',()=>{
  const missing=entry({origin:{provider:'eastmoney-zygc',key:'a',fetchedAt:'',rawField:'income',rawValue:120,rawUnit:'亿元',rawRecord:{},managed:true,missing:true}});
  const h={...emptyHypothesis(base),expectedMin:100,dueDate:'2026-04-30'};
  assert.equal(hypothesisState(h,[missing],'2026-05-01').actual,undefined);
  assert.equal(businessComparison(missing,[missing,entry({periodStart:'2024-01-01',periodEnd:'2024-12-31',value:100})]).growth,null);
});
