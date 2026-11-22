// Deterministic UI coverage; repository/service and parser tests cover ingestion.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export async function verifyAutomaticBusiness(page,origin,root) {
  const data={dimension:'产品',segment:'自动抓取产品',metric:'收入',unit:'亿元',currency:'CNY',basis:'东财主营构成·按产品分类·年初累计',periodStart:'2026-01-01',periodEnd:'2026-06-30',value:123.4,sourceText:'东方财富主营构成 · 2026-06-30（二次整理）',sourceUrl:'https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/Index?type=web&code=SH600519',page:'数据源未提供原报告页码',note:'原始金额人民币元，换算为亿元；年初累计。',archived:false,origin:{provider:'eastmoney-zygc',key:'fixture',fetchedAt:'2026-10-23T06:00:00Z',rawField:'MAIN_BUSINESS_INCOME',rawValue:12340000000,rawUnit:'元',rawRecord:{ITEM_NAME:'自动抓取产品',REPORT_DATE:'2026-06-30',MAIN_BUSINESS_INCOME:12340000000},managed:true,missing:false}};
  let fail=false;
  const pattern='**/api/finance/research/*/*/business-sync?*';
  await page.route(pattern,async route=>{
    const url=new URL(route.request().url());
    const state=await(await fetch(`${origin}${url.pathname.replace('/business-sync','')}`)).json();
    const hk=url.pathname.includes('/hk/');
    const entry=hk?{...data,segment:'港股自动抓取业务',dimension:'业务',currency:'HKD',value:56.7,basis:'富途收入构成·业务·财年累计',sourceText:'富途收入构成',sourceUrl:'https://www.futunn.com/stock/00700-HK/financials-revenue',origin:{...data.origin,provider:'futu-hk-revenue',rawField:'mainOperIncome',rawValue:'56.7',rawUnit:'亿',rawRecord:{mainOperIncome:'56.7亿',currency:'港元'}}}:data;
    state.business.push({id:'auto-fixture',version:1,updatedAt:data.origin.fetchedAt,data:entry});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({state,sync:{status:!hk&&fail?'error':'ready',attemptedAt:data.origin.fetchedAt,lastSuccessAt:data.origin.fetchedAt,message:hk?'已同步富途收入构成':fail?'自动抓取失败，原有数据保留。测试超时':'已同步东方财富主营构成；原始字段、单位换算和来源已保存。',added:!hk&&fail?0:1,updated:0,protected:0,missing:0,sourceRows:1,skipped:0}})});
  });
  await page.goto(`${origin}/?market=a&symbol=600519`);
  const panel=page.getByRole('region',{name:'分业务经营数据',exact:true});
  await panel.getByRole('region',{name:'分业务指标对比图'}).getByText('本期 123.4 亿元',{exact:true}).waitFor();
  await panel.getByText(/^业务明细与来源/).click();
  await panel.getByRole('cell',{name:/123.4 亿元/}).waitFor();
  await panel.getByText('自动抓取 · 原始证据',{exact:true}).click();
  assert.ok((await panel.innerText()).includes('12340000000 元'));
  assert.ok((await panel.innerText()).includes('MAIN_BUSINESS_INCOME'));
  assert.ok((await panel.innerText()).includes('数据源未提供原报告页码'));
  await panel.screenshot({path:resolve(root,'data/business-auto.png'),style:'.topbar {visibility:hidden}'});
  fail=true;
  await page.getByRole('button',{name:'刷新自动业务数据',exact:true}).click();
  await page.getByText('自动抓取失败，原有数据保留。测试超时',{exact:true}).waitFor();
  assert.ok((await panel.innerText()).includes('123.4'));
  await page.getByRole('button',{name:/港股验证公司/}).first().click();
  await page.getByText('已同步富途收入构成',{exact:true}).waitFor();
  await panel.getByRole('region',{name:'分业务指标对比图'}).getByText('本期 56.7 亿元',{exact:true}).waitFor();
  const refresh=page.getByRole('button',{name:'刷新自动业务数据',exact:true});
  assert.equal(await refresh.isEnabled(),true);
  const refreshed=page.waitForResponse(response=>response.url().includes('/hk/00700/business-sync?refresh=true'));
  await refresh.click();
  await refreshed;
  assert.equal(await panel.getByText('自动抓取产品',{exact:true}).count(),0);
  await page.unroute(pattern);
  console.log('PASS: A-share and HK automatic business data, raw evidence, refresh, retained data on errors and company isolation.');
}
