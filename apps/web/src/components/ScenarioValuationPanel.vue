<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { CompanySearchResult, FinancialStatements } from '../types/finance';
import { calculateScenario, emptyValuationModel, impliedGrowth, modelErrors, type ValuationSnapshot } from '../finance/scenario-valuation';
import { getValuationModels, saveValuationModel } from '../services/api';
import { rowValue } from '../finance/financial-metric-engine';
import { PARENT_PROFIT } from '../finance/operating-periods';
import { DEDUCTED_NET_PROFIT_ALIASES } from '../finance/financial-metric-fields';

const props = defineProps<{ company: CompanySearchResult; statements: FinancialStatements | null }>();
const model = ref(emptyValuationModel());
const snapshots = ref<ValuationSnapshot[]>([]);
const loading = ref(true), saving = ref(false), error = ref(''), message = ref('');
const savedJson = ref('');
const selectedSnapshot = ref('');
const controller = new AbortController();
let alive = true;
onBeforeUnmount(() => { alive = false; controller.abort(); });
watch(() => [model.value.reportCurrency, model.value.quoteCurrency], ([a, b]) => { if (a === b) model.value.fx = 1; });
const errors = computed(() => modelErrors(model.value));
const results = computed(() => model.value.scenarios.map(s => calculateScenario(model.value, s)));
const reverseGrowth = computed(() => impliedGrowth(model.value, model.value.scenarios[1]));
const dirty = computed(() => JSON.stringify(model.value) !== savedJson.value);
const sourceChanged = computed(() => model.value.statementHash && props.statements?.version?.currentHash && model.value.statementHash !== props.statements.version.currentHash);
const canImport = computed(() => props.statements?.company.symbol === props.company.symbol && props.statements?.company.market === props.company.market
  && props.statements?.amountScale === 1 && Boolean(props.statements?.reportingCurrency));
const money = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const percent = (v: number | null | undefined) => v == null ? '—' : `${(v * 100).toFixed(2)}%`;
const sensitivity = computed(() => {
  const s = model.value.scenarios[1];
  const growths = [...new Set([s.growth - 5, s.growth, s.growth + 5].map(g => Math.max(-95, Math.min(100, g))))];
  const pes = [...new Set([s.exitPe - 5, s.exitPe, s.exitPe + 5].map(pe => Math.max(1, Math.min(200, pe))))];
  return { pes, rows: growths.map(growth => ({ growth, cells: pes.map(exitPe => calculateScenario(model.value, { ...s, growth, exitPe })?.fairPrice) })) };
});

function importProfit() {
  if (!canImport.value || !props.statements) return;
  const statements = props.statements;
  const year = statements.years[0];
  const table = statements.tables.find(t => t.type === 'income');
  const aliases = model.value.profitBasis === '扣非归母净利润' ? DEDUCTED_NET_PROFIT_ALIASES : PARENT_PROFIT;
  const amount = year ? rowValue(table, year, aliases) : null;
  if (amount === null) { error.value = '最新年度没有该口径利润，请核对后手工输入；未使用往年或合并净利润替代。'; return; }
  model.value.baseProfit = amount / 1e8;
  model.value.basePeriod = `${year}年报`;
  model.value.reportCurrency = statements.reportingCurrency!;
  model.value.quoteCurrency ||= props.company.market === 'hk' ? 'HKD' : 'CNY';
  model.value.baseSource = `${statements.source}；获取时间 ${statements.fetchedAt}`;
  model.value.statementHash = statements.version?.currentHash ?? '';
  error.value = '';
}
function changeProfitBasis() {
  model.value.baseProfit = null;
  model.value.statementHash = '';
  message.value = '利润口径已切换，请重新导入或输入对应利润。';
}
function restore() {
  const snapshot = snapshots.value.find(s => String(s.id) === selectedSnapshot.value);
  if (!snapshot) return;
  // Snapshots live in a Vue ref; structuredClone cannot clone reactive proxies.
  model.value = JSON.parse(JSON.stringify(snapshot.model));
  savedJson.value = JSON.stringify(model.value);
  message.value = `已载入 ${new Date(snapshot.savedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 的快照；修改后另存新版本。`;
  error.value = '';
}
async function load() {
  try {
    const list = await getValuationModels(props.company.market, props.company.symbol, controller.signal);
    if (!alive) return;
    snapshots.value = list;
    if (list[0]) { selectedSnapshot.value = String(list[0].id); restore(); }
  } catch (e) { if (alive) error.value = `历史估值读取失败：${e instanceof Error ? e.message : String(e)}`; }
  finally { if (alive) loading.value = false; }
}
async function save() {
  const issues = modelErrors(model.value, true);
  if (issues.length) { error.value = issues.join(' '); return; }
  saving.value = true; error.value = ''; message.value = '';
  // Preserve exactly the reviewed inputs even when the user edits while saving.
  const snapshotModel = JSON.parse(JSON.stringify(model.value));
  try {
    const snapshot = await saveValuationModel(props.company.market, props.company.symbol, snapshotModel);
    if (!alive) return;
    snapshots.value = [snapshot, ...snapshots.value].slice(0, 30);
    selectedSnapshot.value = String(snapshot.id);
    savedJson.value = JSON.stringify(snapshotModel);
    message.value = '已保存到本地数据库，历史快照保留。';
  } catch (e) { if (alive) error.value = `保存失败：${e instanceof Error ? e.message : String(e)}`; }
  finally { if (alive) saving.value = false; }
}
void load();
</script>

<template>
  <section class="research-workbench" aria-label="三情景估值">
    <header><div><span class="eyebrow">假设驱动 · PE终值法</span><h2>三情景估值工作台</h2></div><small>{{ dirty ? '当前输入未保存' : '已保存快照' }}</small></header>
    <p>增长率和PE初始值仅作示例，请按企业情况修改。金额输入为报告币种的“亿元”，股本为“亿股”，价格和每股结果使用报价币种。</p>
    <p v-if="loading" role="status">正在读取已保存的估值…</p>
    <template v-else>
      <div class="workbench-actions">
        <select v-if="snapshots.length" v-model="selectedSnapshot" aria-label="历史估值快照"><option v-for="s in snapshots" :key="s.id" :value="String(s.id)">{{ new Date(s.savedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }} · {{ s.model.basePeriod }}</option></select>
        <button v-if="snapshots.length" type="button" @click="restore">载入快照</button>
        <button type="button" :disabled="!canImport || model.profitBasis === '调整后归母净利润'" @click="importProfit">导入最新年报利润</button>
        <small v-if="!canImport">财报币种／金额倍率未确认时，请核对原报告后手工录入。</small>
      </div>
      <p v-if="sourceChanged" class="workbench-error">财报版本已变化，当前假设仍保留原版本；请核对新数据后另存估值。</p>
      <div class="workbench-fields">
        <label>利润口径<select v-model="model.profitBasis" @change="changeProfitBasis"><option>归母净利润</option><option>扣非归母净利润</option><option>调整后归母净利润</option></select></label>
        <label>基准利润（亿元）<input v-model.number="model.baseProfit" type="number" step="any" /></label>
        <label>总股本（亿股）<input v-model.number="model.shares" type="number" step="any" /></label>
        <label>测算价格（报价币种／股）<input v-model.number="model.price" type="number" step="any" /></label>
        <label>利润期间<input v-model="model.basePeriod" placeholder="例如：2025年报或截至2026中报TTM" maxlength="120" /></label>
        <label>估值／价格基准日期<input v-model="model.valuationDate" type="date" /></label>
        <label>报告币种<select v-model="model.reportCurrency"><option value="">请选择</option><option>CNY</option><option>HKD</option><option>USD</option></select></label>
        <label>报价币种<select v-model="model.quoteCurrency"><option value="">请选择</option><option>CNY</option><option>HKD</option><option>USD</option></select></label>
        <label>汇率（1报告币种→报价币种）<input v-model.number="model.fx" type="number" step="any" :disabled="model.reportCurrency === model.quoteCurrency" /></label>
        <label>汇率日期<input v-model="model.fxDate" type="date" :disabled="model.reportCurrency === model.quoteCurrency" /></label>
        <label>预测期限<select v-model.number="model.years"><option :value="3">3年</option><option :value="5">5年</option></select></label>
        <label>要求年回报率（%）<input v-model.number="model.requiredReturn" type="number" min="0" max="100" step="any" /></label>
        <label>安全边际（%）<input v-model.number="model.safetyMargin" type="number" min="0" max="90" step="any" /></label>
      </div>
      <label>利润、股本与价格来源／调整说明<textarea v-model="model.baseSource" rows="2" maxlength="2000" placeholder="记录报告链接、页码、股本及价格日期；调整利润时说明增减项目。" /></label>
      <div class="scenario-grid">
        <article v-for="(scenario, index) in model.scenarios" :key="index" class="scenario-card">
          <h3>{{ scenario.name }}</h3>
          <label>利润年增长率（%）<input v-model.number="scenario.growth" type="number" min="-95" max="100" step="any" /></label>
          <label>退出PE（倍）<input v-model.number="scenario.exitPe" type="number" min="1" max="200" step="any" /></label>
          <label>年度现金分红率（%利润）<input v-model.number="scenario.payout" type="number" min="0" max="100" step="any" /></label>
          <label>总股本年变化（%）<input v-model.number="scenario.shareChange" type="number" min="-20" max="100" step="any" /></label>
          <label>假设依据<textarea v-model="scenario.rationale" rows="3" maxlength="4000" placeholder="增长与估值依据、分红及回购可持续性" /></label>
          <dl><dt>期末利润（亿元）</dt><dd>{{ money(results[index]?.terminalProfit) }}</dd>
            <dt>期末市值（亿元）</dt><dd>{{ money(results[index]?.terminalMarketCap) }}</dd>
            <dt>期末每股价格</dt><dd>{{ money(results[index]?.terminalPrice) }}</dd>
            <dt>当前每股价值</dt><dd>{{ money(results[index]?.fairPrice) }}</dd>
            <dt>安全边际后观察价</dt><dd>{{ money(results[index]?.watchPrice) }}</dd>
            <dt>情景年化回报（IRR）</dt><dd>{{ percent(results[index]?.annualReturn) }}</dd></dl>
        </article>
      </div>
      <div v-if="errors.length" class="workbench-error" role="status"><p>补齐有效输入后计算：</p><ul><li v-for="issue in errors" :key="issue">{{ issue }}</li></ul></div>
      <template v-else>
        <h3>中性情景敏感性：当前每股价值（{{ model.quoteCurrency }}）</h3>
        <div class="workbench-scroll"><table><thead><tr><th>年增长率 / 退出PE</th><th v-for="pe in sensitivity.pes" :key="pe">{{ pe }}倍</th></tr></thead><tbody><tr v-for="row in sensitivity.rows" :key="row.growth"><th>{{ row.growth }}%</th><td v-for="(value, i) in row.cells" :key="i">{{ money(value) }}</td></tr></tbody></table></div>
        <p>保持中性情景其他参数不变，要使当前测算价格达到 {{ model.requiredReturn }}% 的年回报，隐含利润年增长率为 <strong>{{ reverseGrowth === null ? '超出-95%至100%的求解范围' : `${reverseGrowth.toFixed(2)}%` }}</strong>。</p>
      </template>
      <details><summary>公式与适用范围</summary><p>以估值日期为起点按整年测算，基准利润代表当前年度盈利能力；导入历史年报后请判断是否需要调整。第t年利润＝基准利润×(1+增长率)^t；股本同样按年变化。年度每股分红＝当年利润×分红率÷当年股本。终值价格＝期末利润×退出PE÷期末股本。当前每股价值＝各年分红与终值价格按要求回报率折现之和。观察价＝当前每股价值×(1−安全边际)。IRR按期初买入、每年末分红、期末卖出计算，未计税费；分红不假设自动再投资。</p><p>所有未来金额按输入汇率固定换算。股本负增长代表假设中的净回购效果，模型不另行预测回购资金成本；需在利润增长和分红假设中检验资金约束。尚未实现DCF、融资现金流预测或非经营资产单独估值。非正基准利润不计算PE估值。</p></details>
      <div class="workbench-actions"><button type="button" :disabled="saving || errors.length > 0" @click="save">{{ saving ? '保存中…' : '保存估值快照' }}</button><small>保存时需填写三个情景的依据；显示最近30份，数据库保留全部历史。</small></div>
      <p v-if="error" class="workbench-error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    </template>
  </section>
</template>
