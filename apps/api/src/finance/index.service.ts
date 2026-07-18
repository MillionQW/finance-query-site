import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { findIndex } from './index-catalog';
import { IndexStoreService } from './index-store.service';
import { PythonAkshareService } from './python-akshare.service';
import { IndexDetailResponse, IndexHistoryPayload, IndexHistoryPoint, IndexMarket, IndexMarketResponse, IndexMetrics, IndexQuote, IndexValuation } from './index.types';

@Injectable()
export class IndexService {
  private readonly marketCacheMs = 3 * 60 * 1000;
  private readonly historyCacheMs = 24 * 60 * 60 * 1000;
  private marketRefreshPromise: Promise<void> | null = null;
  constructor(
    @Inject(PythonAkshareService) private readonly akshare: PythonAkshareService,
    @Inject(IndexStoreService) private readonly store: IndexStoreService
  ) {}

  async list(q = '', market = 'all', refresh = false): Promise<IndexMarketResponse> {
    const state = await this.ensureMarket(refresh);
    return { items: this.store.listQuotes(q.trim(), market), refreshedAt: state.refreshedAt, source: 'AKShare index spot', cache: { hit: state.hit, stale: state.stale } };
  }

  async detail(market: IndexMarket, symbol: string, years = 10, refresh = false): Promise<IndexDetailResponse> {
    const catalog = findIndex(market, symbol);
    if (!catalog) throw new HttpException(`未找到指数：${market}:${symbol}`, HttpStatus.NOT_FOUND);
    const marketState = await this.ensureMarket(refresh);
    let quote = this.store.getQuote(catalog.market, catalog.symbol);
    if (!quote) throw new HttpException(`未找到指数行情：${catalog.name}`, HttpStatus.NOT_FOUND);
    const startDate = startDateForYears(years);
    const refreshKey = `history:${market}:${catalog.symbol}`;
    const refreshedAt = this.store.getRefresh(refreshKey);
    let history = this.store.getHistory(market, catalog.symbol, startDate);
    let historyHit = !refresh && history.length > 0 && fresh(refreshedAt, this.historyCacheMs);
    let historyStale = false;
    if (!historyHit) {
      try {
        const payload = await this.akshare.run<IndexHistoryPayload>(['index-history','--market',market,'--symbol',catalog.symbol,'--provider-symbol',catalog.historySymbol,'--name',catalog.name,'--years',String(years)]);
        this.store.saveHistory(payload);
        history = this.store.getHistory(market, catalog.symbol, startDate);
        quote = this.store.getQuote(catalog.market, catalog.symbol) ?? quote;
      } catch (error) {
        if (!history.length) throw error;
        historyHit = true;
        historyStale = true;
      }
    }
    return { quote, history, metrics: calculateMetrics(history), cache: { marketHit:marketState.hit,marketStale:marketState.stale,marketRefreshedAt:marketState.refreshedAt,historyHit,historyStale,historyRefreshedAt:this.store.getRefresh(refreshKey) } };
  }

  favorites() { return this.store.getFavorites(); }
  async saveFavorite(market: IndexMarket,symbol:string) { if(!findIndex(market,symbol)) throw new HttpException('指数不存在',HttpStatus.NOT_FOUND); await this.ensureMarket(false); return this.store.saveFavorite(market,symbol); }
  removeFavorite(market: IndexMarket,symbol:string) { return this.store.removeFavorite(market,symbol); }

  async valuation(market:IndexMarket,symbol:string,refresh=false):Promise<IndexValuation> {
    const item=findIndex(market,symbol); if(!item) throw new HttpException('指数不存在',HttpStatus.NOT_FOUND);
    const cached=this.store.getValuation(market,item.symbol);
    if(!refresh&&cached&&fresh(cached.fetchedAt,24*60*60*1000)) return cached;
    const supported=market==='cn'&&item.historySymbol.startsWith('csi');
    if(!supported){const value:IndexValuation={market,symbol:item.symbol,name:item.name,peTotalShares:null,peCalculatedShares:null,valuationDate:null,available:false,unavailableReason:'当前数据源暂不提供该指数的同口径市盈率',fetchedAt:new Date().toISOString(),source:'Index catalog coverage'};this.store.saveValuation(value);return value;}
    try { const value=await this.akshare.run<IndexValuation>(['index-valuation','--market',market,'--symbol',item.symbol,'--name',item.name]); this.store.saveValuation(value); return value; }
    catch(error){if(cached)return cached;throw error;}
  }

  private async ensureMarket(force:boolean):Promise<{hit:boolean;stale:boolean;refreshedAt:string|null}> {
    const refreshedAt=this.store.getRefresh('market');
    if(!force && this.store.countQuotes()>0 && fresh(refreshedAt,this.marketCacheMs)) return {hit:true,stale:false,refreshedAt};
    if(!force && this.store.countQuotes()>0 && refreshedAt) { void this.refreshMarket().catch(()=>undefined); return {hit:true,stale:true,refreshedAt}; }
    try { await this.refreshMarket(); return {hit:false,stale:false,refreshedAt:this.store.getRefresh('market')}; }
    catch(error) { if(!this.store.countQuotes()) throw error; return {hit:true,stale:true,refreshedAt}; }
  }
  private refreshMarket():Promise<void> { if(this.marketRefreshPromise) return this.marketRefreshPromise; this.marketRefreshPromise=this.akshare.run<IndexQuote[]>(['index-market']).then(q=>this.store.saveQuotes(q)).finally(()=>this.marketRefreshPromise=null); return this.marketRefreshPromise; }
}

function fresh(value:string|null,maxAge:number):boolean { if(!value)return false; const normalized=/(Z|[+-]\d\d:\d\d)$/.test(value)?value:`${value}Z`; return Date.now()-new Date(normalized).getTime()<maxAge; }
function startDateForYears(years:number):string { const d=new Date(); d.setFullYear(d.getFullYear()-Math.max(1,Math.min(years,20))); return d.toISOString().slice(0,10); }
function calculateMetrics(points:IndexHistoryPoint[]):IndexMetrics {
  const valid=points.filter((p):p is IndexHistoryPoint & {close:number}=>typeof p.close==='number'&&p.close>0);
  if(!valid.length) return {return20d:null,return60d:null,returnYtd:null,annualizedReturn:null,annualizedVolatility:null,maxDrawdown:null,currentDrawdown:null,periodHigh:null,periodLow:null,tradingDays:0};
  const closes=valid.map(p=>p.close), latest=closes.at(-1)!, returns=closes.slice(1).map((v,i)=>v/closes[i]-1), years=Math.max((valid.length-1)/252,1/252);
  const avg=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:null;
  const variance=avg===null||returns.length<2?null:returns.reduce((s,v)=>s+(v-avg)**2,0)/(returns.length-1);
  let peak=closes[0],maxDrawdown=0; for(const close of closes){peak=Math.max(peak,close);maxDrawdown=Math.min(maxDrawdown,close/peak-1);}
  const latestYear=valid.at(-1)!.date.slice(0,4),ytd=valid.find(p=>p.date.startsWith(latestYear))?.close??null;
  return {return20d:periodReturn(closes,20),return60d:periodReturn(closes,60),returnYtd:ytd?latest/ytd-1:null,annualizedReturn:(latest/closes[0])**(1/years)-1,annualizedVolatility:variance===null?null:Math.sqrt(variance)*Math.sqrt(252),maxDrawdown,currentDrawdown:latest/Math.max(...closes)-1,periodHigh:Math.max(...valid.map(p=>p.high??p.close)),periodLow:Math.min(...valid.map(p=>p.low??p.close)),tradingDays:valid.length};
}
function periodReturn(v:number[],days:number):number|null { return v.length>days?v.at(-1)!/v[v.length-1-days]-1:null; }
