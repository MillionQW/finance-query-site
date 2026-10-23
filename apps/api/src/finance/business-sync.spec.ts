import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { BusinessSyncService } from './business-sync.service';
import { ResearchTrackingRepository } from './store/research-tracking.repository';
import { initializeFinanceStoreSchema } from './store/finance-store.schema';
import type { BusinessData } from './research-tracking.types';

const observation: BusinessData = { dimension:'产品', segment:'产品A', metric:'收入', unit:'亿元', currency:'CNY', basis:'东财主营构成·按产品分类·年初累计', periodStart:'2025-01-01', periodEnd:'2025-06-30', value:12, sourceText:'东方财富主营构成', sourceUrl:'https://emweb.securities.eastmoney.com/', page:'未提供', note:'测试口径', archived:false,
  origin:{provider:'eastmoney-zygc',key:'a',fetchedAt:'2026-01-01T00:00:00Z',rawField:'MAIN_BUSINESS_INCOME',rawValue:1200000000,rawUnit:'元',rawRecord:{ITEM_NAME:'产品A'},managed:true,missing:false} };
function fixture() {
  const db = new DatabaseSync(':memory:'); initializeFinanceStoreSchema(db);
  const repo = new ResearchTrackingRepository(db);
  let rows = [structuredClone(observation)], calls = 0, fail = false;
  const python = {run:async()=>{calls++;if(fail)throw new Error('upstream timeout');return {observations:structuredClone(rows),fetchedAt:new Date().toISOString(),sourceRows:rows.length,skipped:0};}};
  const service = new BusinessSyncService(python as any, {researchTracking:repo} as any);
  return {db,repo,service,calls:()=>calls,setRows:(r:BusinessData[])=>{rows=r;},setFail:()=>{fail=true;}};
}
test('automatic sync is cached, single-flight, idempotent, and retains source revisions',async()=>{
  const f=fixture();try{
    await Promise.all([f.service.sync('a','600519'),f.service.sync('a','600519')]);assert.equal(f.calls(),1);
    await f.service.sync('a','600519');assert.equal(f.calls(),1);
    let actual=f.repo.list('a','600519').business[0];assert.equal(actual.version,1);
    await f.service.sync('a','600519',true);assert.equal(f.repo.list('a','600519').business[0].version,1);
    const h=f.repo.save('a','600519','hypotheses',null,0,{dimension:observation.dimension,segment:observation.segment,metric:observation.metric,unit:observation.unit,currency:observation.currency,basis:observation.basis,periodStart:observation.periodStart,periodEnd:observation.periodEnd,thesis:'收入增长',rationale:'订单',expectedMin:10,expectedMax:20,dueDate:'2025-09-30',valuationSnapshotId:null,archived:false});
    f.repo.review('a','600519',h.id,{expectedVersion:1,businessId:actual.id,businessVersion:1,note:'符合',valuationImpact:'不变'});
    f.setRows([{...observation,value:13,origin:{...observation.origin!,rawValue:1300000000}}]);
    const result=await f.service.sync('a','600519',true);assert.equal(result.sync.updated,1);
    actual=f.repo.list('a','600519').business[0];assert.equal(actual.version,2);
    const history=f.repo.history('a','600519','business',actual.id);
    assert.equal(history[1].data.value,12);assert.equal(history[0].data.origin.rawValue,1300000000);
    assert.equal(f.repo.list('a','600519').hypotheses[0].data.review?.actual,12);
    assert.throws(()=>f.repo.review('a','600519',h.id,{expectedVersion:2,businessId:actual.id,businessVersion:1,note:'符合',valuationImpact:'不变'}),/修订/);
    assert.deepEqual(f.repo.list('hk','00700').business,[]);
  }finally{f.db.close();}
});
test('manual edits and archive stay protected; source provenance cannot be forged',async()=>{
  const f=fixture();try{
    const manual=f.repo.save('a','000001','business',null,0,observation);assert.equal(manual.data.origin,undefined);
    await f.service.sync('a','600519');const a=f.repo.list('a','600519').business[0];
    f.repo.save('a','600519','business',a.id,a.version,{...a.data,value:99,archived:true,origin:{...a.data.origin!,key:'forged'}});
    const result=await f.service.sync('a','600519',true);
    assert.equal(result.sync.protected,1);assert.equal(result.state.business.length,1);
    assert.equal(result.state.business[0].data.value,99);assert.equal(result.state.business[0].data.origin?.key,'a');
    assert.equal(result.state.business[0].data.origin?.managed,false);
    const duplicate=await f.service.sync('a','000001');assert.equal(duplicate.sync.protected,1);assert.equal(duplicate.state.business.length,1);
  }finally{f.db.close();}
});
test('failures and empty sources preserve data; missing source entries are flagged and recoverable',async()=>{
  const f=fixture();try{
    await f.service.sync('a','600519');f.setRows([]);
    const empty=await f.service.sync('a','600519',true);assert.equal(empty.sync.status,'empty');assert.equal(empty.state.business[0].data.origin?.missing,false);
    f.setRows([{...observation,segment:'产品B',origin:{...observation.origin!,key:'b'}}]);
    const missing=await f.service.sync('a','600519',true);assert.equal(missing.sync.missing,1);
    assert.equal(missing.state.business.find(e=>e.data.segment==='产品A')?.data.origin?.missing,true);
    f.setRows([observation]);const restored=await f.service.sync('a','600519',true);
    assert.equal(restored.state.business.find(e=>e.data.segment==='产品A')?.data.origin?.missing,false);
    f.setFail();const failed=await f.service.sync('a','600519',true);
    assert.equal(failed.sync.status,'error');assert.equal(failed.state.business.length,2);assert.ok(failed.sync.lastSuccessAt);
    const calls=f.calls();await f.service.sync('a','600519');assert.equal(f.calls(),calls);
    const hk=await f.service.sync('hk','00700');assert.equal(hk.sync.status,'unsupported');assert.equal(f.calls(),calls);
  }finally{f.db.close();}
});
test('invalid import is rejected atomically without altering prior records',async()=>{
  const f=fixture();try{
    await f.service.sync('a','600519');f.setRows([{...observation,value:14},{...observation,value:NaN,origin:{...observation.origin!,key:'b'}}]);
    const result=await f.service.sync('a','600519',true);assert.equal(result.sync.status,'error');assert.equal(result.state.business[0].data.value,12);
  }finally{f.db.close();}
});
