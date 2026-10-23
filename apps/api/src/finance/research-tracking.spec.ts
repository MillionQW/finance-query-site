import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BusinessInputDto,HypothesisInputDto } from './research-tracking.dto';
import { cleanResearchInput } from './research-tracking.validation';
import { ResearchTrackingRepository } from './store/research-tracking.repository';
import { initializeFinanceStoreSchema } from './store/finance-store.schema';
import type { BusinessData,HypothesisData } from './research-tracking.types';

const business:BusinessData={dimension:'业务',segment:'广告',metric:'收入',unit:'亿元',currency:'CNY',basis:'对外收入',periodStart:'2025-01-01',periodEnd:'2025-12-31',value:100,sourceText:'2025年报',sourceUrl:'https://example.com/report',page:'50',note:'',archived:false};
const {value:unusedValue,sourceText:unusedSource,sourceUrl:unusedUrl,page:unusedPage,note:unusedNote,...identity}=business;
const hypothesis:HypothesisData={...identity,thesis:'收入保持增长',rationale:'订单与用户增长',expectedMin:90,expectedMax:110,dueDate:'2026-04-30',valuationSnapshotId:null};
function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');initializeFinanceStoreSchema(db);return db;}
test('research DTOs reject null business values and omitted/invalid range bounds',async()=>{
  const data=plainToInstance(BusinessInputDto,{...business,expectedVersion:0});assert.equal((await validate(data)).length,0);
  for(const value of [null,'',NaN,Infinity]){assert.ok((await validate(plainToInstance(BusinessInputDto,{...business,expectedVersion:0,value}))).length);}
  const h=plainToInstance(HypothesisInputDto,{...hypothesis,expectedVersion:0,expectedMin:null});assert.equal((await validate(h)).length,0);
  assert.ok((await validate(plainToInstance(HypothesisInputDto,{...hypothesis,expectedVersion:0,expectedMin:undefined}))).length);
});
test('research validation requires real dates, evidence, consistent ranges and safe source links',()=>{
  assert.doesNotThrow(()=>cleanResearchInput({...business,expectedVersion:0}));
  for(const patch of [{sourceText:'  '},{sourceUrl:'javascript:alert(1)'},{periodEnd:'2025-02-30'},{currency:''}])assert.throws(()=>cleanResearchInput({...business,...patch,expectedVersion:0}));
  for(const patch of [{expectedMin:200},{expectedMin:null,expectedMax:null},{dueDate:'2025-01-01'},{rationale:' '}])assert.throws(()=>cleanResearchInput({...hypothesis,...patch,expectedVersion:0}));
});
test('business revisions are immutable, scoped by company, and reject duplicates or lost updates',()=>{
  const db=database();try{
    const repo=new ResearchTrackingRepository(db);
    const first=repo.save('a','600519','business',null,0,business);
    assert.throws(()=>repo.save('a','600519','business',null,0,business),/已有/);
    const next=repo.save('a','600519','business',first.id,1,{...business,value:120});
    assert.equal(next.version,2);assert.equal(repo.history('a','600519','business',first.id)[1].data.value,100);
    assert.throws(()=>repo.save('a','600519','business',first.id,1,business),/更新/);
    assert.throws(()=>repo.history('hk','00700','business',first.id),/不属于/);
    assert.deepEqual(repo.list('hk','00700').business,[]);
    repo.save('a','600519','business',first.id,2,{...business,archived:true});
    repo.save('a','600519','business',null,0,business);
    assert.equal(repo.list('a','600519').business.length,2);
  }finally{db.close();}
});
test('verification binds exact observation versions, computes outcome on the server, and retains prior evidence',()=>{
  const db=database();try{
    const repo=new ResearchTrackingRepository(db);
    const actual=repo.save('a','600519','business',null,0,business);
    const h=repo.save('a','600519','hypotheses',null,0,hypothesis);
    const input={expectedVersion:1,businessId:actual.id,businessVersion:1,note:'符合预期',valuationImpact:'维持增长假设'};
    const reviewed=repo.review('a','600519',h.id,input);
    assert.equal(reviewed.data.review?.actual,100);assert.equal(reviewed.data.review?.outcome,'met');
    repo.save('a','600519','business',actual.id,1,{...business,value:50});
    assert.throws(()=>repo.review('a','600519',h.id,{...input,expectedVersion:2}),/修订/);
    const revised=repo.review('a','600519',h.id,{...input,expectedVersion:2,businessVersion:2,note:'低于预期',valuationImpact:'下调估值'});
    assert.equal(revised.data.review?.outcome,'missed');
    const history=repo.history('a','600519','hypotheses',h.id);
    assert.equal(history[1].data.review.actual,100);
    assert.equal(history[0].data.review.actual,50);
    const edited=repo.save('a','600519','hypotheses',h.id,3,{...hypothesis,expectedMin:40});
    assert.equal(edited.data.review,undefined);
  }finally{db.close();}
});
test('wrong period, unit, currency or archived data cannot satisfy a hypothesis',()=>{
  for(const patch of [{currency:'HKD'},{unit:'万元'},{periodStart:'2025-07-01'},{basis:'含内部收入'},{archived:true}]){
    const db=database();try{const repo=new ResearchTrackingRepository(db);
      const actual=repo.save('a','600519','business',null,0,{...business,...patch});
      const h=repo.save('a','600519','hypotheses',null,0,hypothesis);
      assert.throws(()=>repo.review('a','600519',h.id,{expectedVersion:1,businessId:actual.id,businessVersion:1,note:'test',valuationImpact:'test'}),/尚无/);
    }finally{db.close();}
  }
});
test('hypotheses cannot link another company valuation snapshot',()=>{
  const db=database();try{const repo=new ResearchTrackingRepository(db);
    db.prepare('INSERT INTO company_valuation_models (market,symbol,saved_at,payload_json) VALUES (?,?,?,?)').run('hk','00700','2026-01-01','{}');
    assert.throws(()=>repo.save('a','600519','hypotheses',null,0,{...hypothesis,valuationSnapshotId:1}),/不属于/);
    assert.equal(repo.list('a','600519').hypotheses.length,0);
  }finally{db.close();}
});
