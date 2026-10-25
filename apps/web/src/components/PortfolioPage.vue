<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Plus, RefreshCw, Search, Wallet, AlertCircle } from 'lucide-vue-next';
import HoldingEditor from './HoldingEditor.vue';
import { searchCompanies } from '../services/api';
import { getHoldings, getPortfolioQuote, removeHolding, saveHolding } from '../services/portfolio';
import { holdingSupported, portfolioDate, shanghaiYear, valuationExpired, holdingAllocation, impliedSharePrice } from '../finance/portfolio';
import type { CompanySearchResult, MarketFilter } from '../types/finance';
import type { Holding, QuoteResult } from '../types/portfolio';
import '../styles/portfolio.css';

const holdings = ref<Holding[]>([]);
const quotes = ref<Record<string, QuoteResult>>({});
const loadingQuotes = ref<Record<string, boolean>>({});
const loading = ref(true), refreshing = ref(false), searching = ref(false), adding = ref(false);
const error = ref(''), searchError = ref(''), query = ref(''), market = ref<MarketFilter>('all');
const results = ref<CompanySearchResult[]>([]);
const editing = ref<Holding | null>(null), deleting = ref<number | null>(null), deletingBusy = ref(false);
const notice = ref(''), now = ref(new Date());
const abort = new AbortController();
let searchAbort: AbortController | null = null;
let timer: number;
const key = (h: { market: string; symbol: string }) => `${h.market}:${h.symbol}`;
const stats = computed(() => holdingAllocation(holdings.value, fx.value?.price));
const sortedHoldings = computed(() => [...holdings.value].sort((a, b) => {
  // Converted amounts have the same order as weights, including while the
  // portfolio denominator is incomplete. Unknown amounts go after zero.
  const left = stats.value.cnyValues[a.id] ?? -1;
  const right = stats.value.cnyValues[b.id] ?? -1;
  return right - left || a.id - b.id;
}));
const expired = (h: Holding) => valuationExpired(h.valuation, h.valuationUpdatedAt, now.value);
const expiredCount = computed(() => holdings.value.filter(expired).length);
const quote = (h: { market: string; symbol: string }) => quotes.value[key(h)]?.quote;
const fx = computed(() => quotes.value['fx:HKDCNY']?.quote);
const benchmark = computed(() => quotes.value['index:000300']);
const number = (v: number | null | undefined, digits = 2) => v == null ? '—' : v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ytd = (q: QuoteResult | undefined) => q?.quote?.year === shanghaiYear(now.value) ? q.quote.ytd : null;
const percent = (v: number | null | undefined) => v == null ? '—' : `${v > 0 ? '+' : ''}${number(v)}%`;
function capCny(h: Holding) {
  const q = quote(h);
  if (q?.marketCap == null) return null;
  return q.currency === 'CNY' ? q.marketCap : q.currency === 'HKD' && fx.value?.price ? q.marketCap * fx.value.price : null;
}
function targetPrice(h: Holding, value: string): string {
  if (!value) return '';
  const price = impliedSharePrice(value, quote(h)?.price, capCny(h));
  if (price === null) return '每股价暂不可算（需数字估值、行情及汇率）';
  const stale = quotes.value[key(h)]?.stale || (quote(h)?.currency === 'HKD' && quotes.value['fx:HKDCNY']?.stale);
  return `约 ${number(price, h.market === 'hk' ? 3 : 2)} ${quote(h)?.currency === 'HKD' ? '港币' : '人民币'}/股${stale ? '（旧行情估算）' : ''}`;
}

async function loadQuote(m: string, s: string, force = false) {
  const k = `${m}:${s}`;
  loadingQuotes.value[k] = true;
  try { quotes.value[k] = await getPortfolioQuote(m, s, force, abort.signal); }
  catch (e) {
    if (!abort.signal.aborted) quotes.value[k] = { quote: quotes.value[k]?.quote ?? null, stale: true, error: e instanceof Error ? e.message : '行情获取失败' };
  } finally { loadingQuotes.value[k] = false; }
}
async function refresh(force = false) {
  if (refreshing.value) return;
  refreshing.value = true;
  const tasks = [{ market: 'index', symbol: '000300' }, { market: 'fx', symbol: 'HKDCNY' }, ...holdings.value];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
    while (cursor < tasks.length && !abort.signal.aborted) {
      const item = tasks[cursor++]; await loadQuote(item.market, item.symbol, force);
    }
  }));
  refreshing.value = false;
}
async function load() {
  loading.value = true; error.value = '';
  try { holdings.value = await getHoldings(abort.signal); void refresh(); }
  catch (e) { if (!abort.signal.aborted) error.value = e instanceof Error ? e.message : '读取失败'; }
  finally { loading.value = false; }
}
async function search() {
  searchAbort?.abort();
  results.value = []; searchError.value = '';
  if (!query.value.trim()) return;
  const controller = new AbortController(); searchAbort = controller; searching.value = true;
  try {
    const found = await searchCompanies(query.value.trim(), market.value, controller.signal);
    if (controller.signal.aborted) return;
    results.value = found.filter(c => holdingSupported(c.market, c.symbol));
    if (!results.value.length) searchError.value = '没有找到匹配的A股或港股公司';
  } catch (e) { if (!controller.signal.aborted) searchError.value = e instanceof Error ? e.message : '搜索失败'; }
  finally { if (searchAbort === controller) searching.value = false; }
}
async function add(company: CompanySearchResult) {
  adding.value = true; searchError.value = '';
  try {
    const saved = await saveHolding(null, { market: company.market, symbol: company.symbol, name: company.name,
      holdingValue: null, holdingCurrency: company.market === 'hk' ? 'HKD' : 'CNY', valuation: '', buyPoint: '', sellPoint: '', note: '', expectedVersion: 0, confirmValuation: false });
    holdings.value.push(saved); results.value = []; query.value = ''; editing.value = saved;
    void loadQuote(saved.market, saved.symbol);
  } catch (e) { searchError.value = e instanceof Error ? e.message : '添加失败'; }
  finally { adding.value = false; }
}
function saved(h: Holding) {
  holdings.value = holdings.value.map(item => item.id === h.id ? h : item);
  editing.value = null; now.value = new Date(); notice.value = '已保存到本地数据库';
}
async function remove(h: Holding) {
  deletingBusy.value = true; error.value = '';
  try { await removeHolding(h); holdings.value = holdings.value.filter(item => item.id !== h.id); deleting.value = null; }
  catch (e) { error.value = e instanceof Error ? e.message : '移除失败'; }
  finally { deletingBusy.value = false; }
}
function updateClock() { now.value = new Date(); }
onMounted(() => { void load(); timer = window.setInterval(updateClock, 30_000); window.addEventListener('focus', updateClock); });
onUnmounted(() => { abort.abort(); searchAbort?.abort(); window.clearInterval(timer); window.removeEventListener('focus', updateClock); });
</script>

<template>
  <section class="portfolio-page" aria-label="持仓估值表">
    <header class="portfolio-heading">
      <div><span class="portfolio-eyebrow"><Wallet :size="15" /> 我的投资记录</span><h1>持仓估值表</h1>
        <p>把持仓、估值判断与市场价格放在一起。主观判断由你填写，客观行情自动更新。</p></div>
      <div class="portfolio-actions"><button :disabled="loading || refreshing" @click="load">重新载入</button>
        <button class="portfolio-primary" :disabled="refreshing || loading" @click="refresh(true)"><RefreshCw :size="15" :class="{ 'spin-icon': refreshing }" />{{ refreshing ? '更新行情中…' : '刷新行情' }}</button></div>
    </header>

    <div class="portfolio-summary">
      <div><span>跟踪企业</span><strong>{{ holdings.length }}<small> 家</small></strong></div>
      <div><span>{{ stats.complete ? '总持仓金额' : '已填写持仓金额' }}（折合人民币）</span><strong>{{ number(stats.total) }}<small> 元</small></strong><p>{{ stats.message }}</p><p v-if="holdings.some(h => h.holdingCurrency === 'HKD' && (h.holdingValue ?? 0) > 0) && quotes['fx:HKDCNY']?.stale" class="portfolio-expired-text">使用上次成功汇率估算，总金额及持股比例可能过期。</p></div>
      <div :class="{ 'portfolio-expired-text': expiredCount > 0 }"><span>本年度估值待更新</span><strong>{{ expiredCount }}<small> 家</small></strong><p>北京时间 {{ shanghaiYear(now) }} 年 · 三年后目标为 {{ shanghaiYear(now) + 3 }} 年</p></div>
    </div>

    <div v-if="expiredCount" class="portfolio-alert" role="status"><AlertCircle :size="18" />{{ expiredCount }} 家公司的三年后估值为过期数据，需要更新。原数值保留，编辑估值并保存后解除提醒。</div>
    <div v-if="error" role="alert" class="portfolio-error">{{ error }}</div>
    <p v-if="notice" role="status" class="portfolio-notice">{{ notice }}</p>

    <div class="portfolio-card">
      <form class="portfolio-search" @submit.prevent="search"><Plus :size="18" /><strong>添加企业</strong>
        <select v-model="market" aria-label="添加企业市场"><option value="all">A股和港股</option><option value="a">A股</option><option value="hk">港股</option></select>
        <input v-model="query" aria-label="搜索持仓企业" placeholder="输入公司名称或股票代码" maxlength="100" />
        <button type="submit" :disabled="searching || !query.trim()"><Search :size="15" />{{ searching ? '搜索中…' : '搜索' }}</button>
      </form>
      <p v-if="searchError" role="alert" class="portfolio-error">{{ searchError }}</p>
      <div v-if="results.length" class="portfolio-search-results"><button v-for="company in results" :key="key(company)"
        :disabled="adding || loading || !!error || holdings.some(h => key(h) === key(company))" @click="add(company)">
        <span>{{ company.name }} <small>{{ company.displaySymbol }}</small></span><span>{{ holdings.some(h => key(h) === key(company)) ? '已添加' : '＋ 添加' }}</span>
      </button></div>

      <div class="portfolio-table-scroll"><table class="portfolio-table">
        <thead><tr><th>持股公司</th><th>持仓总市值<small>元 · 手工填写</small></th><th aria-sort="descending">持股比例 ↓<small>折合人民币后自动计算</small></th><th>三年后估值<small>亿元人民币 · 每年更新</small></th><th>理想买点<small>亿元人民币</small></th><th>1年内卖点<small>亿元人民币</small></th><th>当前市值<small>亿元人民币</small></th><th>当前股价<small>交易币种 / 股</small></th><th>年内涨幅<small>不复权价格涨幅</small></th><th>操作</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="10" class="portfolio-empty">正在读取持仓…</td></tr>
          <tr v-else-if="!holdings.length"><td colspan="10" class="portfolio-empty"><Wallet :size="30" /><strong>从第一家公司开始</strong><span>搜索并添加你关注的A股或港股，再填写持仓金额和估值。</span></td></tr>
          <tr v-for="h in sortedHoldings" :key="h.id">
            <td><strong>{{ h.name }}</strong><small>{{ h.market === 'hk' ? '港股' : 'A股' }} · {{ h.symbol }}</small><small v-if="h.note" class="portfolio-note">{{ h.note }}</small></td>
            <td>{{ h.holdingValue === null ? '未填写' : number(h.holdingValue) }}<small>{{ h.holdingCurrency === 'HKD' ? '港币 HKD' : '人民币 CNY' }}</small><small v-if="h.holdingCurrency === 'HKD' && h.holdingValue !== null">折合人民币 {{ number(stats.cnyValues[h.id]) }} 元</small></td>
            <td data-testid="holding-weight">{{ stats.weights[h.id] == null ? '—' : `${number(stats.weights[h.id])}%` }}</td>
            <td :class="{ 'portfolio-expired': expired(h) }"><strong>{{ h.valuation || '未填写' }}</strong>
              <small v-if="h.valuationUpdatedAt">目标 {{ shanghaiYear(new Date(h.valuationUpdatedAt)) + 3 }} 年</small>
              <small>填写：{{ portfolioDate(h.valuationUpdatedAt) }}</small><span v-if="expired(h)" class="portfolio-expired-badge">过期数据，需要更新</span></td>
            <td>{{ h.buyPoint || '—' }}<small>{{ targetPrice(h, h.buyPoint) }}</small></td><td>{{ h.sellPoint || '—' }}<small>{{ targetPrice(h, h.sellPoint) }}</small></td>
            <td>{{ number(capCny(h)) }}<small v-if="quote(h)?.currency === 'HKD'">{{ number(quote(h)?.marketCap) }} 亿港币</small><small v-if="quote(h)?.currency === 'HKD' && !fx?.price">汇率缺失，暂不换算</small></td>
            <td>{{ number(quote(h)?.price, h.market === 'hk' ? 3 : 2) }} <small>{{ quote(h)?.currency || (h.market === 'hk' ? 'HKD' : 'CNY') }}</small>
              <small v-if="quote(h)">{{ portfolioDate(quote(h)!.quoteAt) }}</small><small v-if="loadingQuotes[key(h)]">正在更新…</small><small v-if="quotes[key(h)]?.error" class="portfolio-expired-text">{{ quotes[key(h)].error }}</small></td>
            <td :class="{ 'portfolio-up': (ytd(quotes[key(h)]) ?? 0) > 0, 'portfolio-down': (ytd(quotes[key(h)]) ?? 0) < 0 }">{{ percent(ytd(quotes[key(h)])) }}
              <small v-if="quote(h)?.warning">{{ quote(h)?.warning }}</small></td>
            <td><div class="portfolio-row-actions"><button @click="editing = h; notice = ''">编辑</button><button @click="deleting = h.id">移除</button></div>
              <div v-if="deleting === h.id" class="portfolio-delete"><small>从表格移除此公司？</small><button :disabled="deletingBusy" @click="remove(h)">确认移除</button><button :disabled="deletingBusy" @click="deleting = null">取消</button></div></td>
          </tr>
        </tbody>
        <tfoot><tr><td><strong>沪深300</strong><small>000300 · 对比基准</small></td><td colspan="6">价格指数 · 与个股使用相同的年初基准规则<small v-if="benchmark?.error" class="portfolio-expired-text">{{ benchmark.error }}</small><small v-if="benchmark?.quote?.warning">{{ benchmark.quote.warning }}</small></td>
          <td>{{ number(benchmark?.quote?.price) }}<small>点 · {{ benchmark?.quote ? portfolioDate(benchmark.quote.quoteAt) : '等待行情' }}</small></td><td>{{ percent(ytd(benchmark)) }}</td><td /></tr></tfoot>
      </table></div>
      <div class="portfolio-foot"><div><strong>港币 / 人民币</strong><span>1 HKD = {{ number(fx?.price, 4) }} CNY</span><small>{{ fx ? `中间价日期 ${portfolioDate(fx.quoteAt)}` : '汇率暂不可用' }}<span v-if="quotes['fx:HKDCNY']?.stale"> · 更新失败，汇率可能过期</span></small></div>
        <p>估值、买卖点及人民币市值使用亿元；港股市值按上述中间价换算。行情可能延迟，交易日期与获取时间分别记录。</p></div>
    </div>
    <details class="portfolio-method"><summary>数据来源与计算口径</summary>
      <p>买卖点下方的每股价 = 填写的总估值（亿元人民币）÷ 当前公司市值（亿元人民币）× 当前股价。按当前行情隐含的股本口径估算，假设股本不变；港股先用页面汇率统一市值币种，结果为港币/股。缺少必要数据或历史输入不是数字时不估算。</p>
      <p>年内涨幅 =（当前报价 ÷ 上年最后可用交易日收盘价 − 1）×100%。使用不复权价格，不含分红；除权除息可能影响比较。新上市、缺少年末基准或行情年份不符时留空，不用年内首日补算。</p>
      <p>持仓比例 = 各公司持仓金额折合人民币 ÷ 表内总持仓金额。持仓金额单位为元，添加港股默认港币，A股默认人民币，可手动切换；仅按手工填写金额计算，不随股票报价自动变动。金额未填齐或缺少必要汇率时不显示比例；无持仓请填0。分母只含表内股票，不含未录入的现金或其他资产；比例显示保留两位小数，合计可能有四舍五入差异。此表不计算实盘净值或组合收益。</p>
      <p>三年后估值记录填写时间和当时的目标年份；进入新自然年后标红。确认沿用原估值也需在编辑窗口主动勾选后保存。</p>
      <ul><li v-for="(result, k) in quotes" :key="k">{{ k }} · {{ result.quote?.source || result.error }}<template v-if="result.quote"> · 获取 {{ portfolioDate(result.quote.fetchedAt) }}<template v-if="result.quote.baseDate"> · 年初基准 {{ result.quote.baseDate }}</template></template></li></ul>
    </details>
    <HoldingEditor v-if="editing" :key="editing.id" :holding="editing" @close="editing = null" @saved="saved" />
  </section>
</template>
