<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-vue-next';
import MacroTrendChart from './MacroTrendChart.vue';
import MacroIndicatorGuide from './MacroIndicatorGuide.vue';
import { macroNumber, macroPeriod, macroValue } from '../finance/macro-format';
import { request } from '../services/api';
import type { MacroOverview, MacroPoint, MacroTrendSeries } from '../types/macro';

const ranges = [{ months: 12, label: '近 1 年' }, { months: 36, label: '近 3 年' },
  { months: 60, label: '近 5 年' }, { months: 0, label: '全部' }];
const pageSize = 15;
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' });
const url = '/macro';
const lifetime = new AbortController();
const comparisons: Record<string, { title: string; label: string; ids: string[] }> = {
  pmi: { title: '官方制造业 PMI 与新订单', label: '制造业 PMI', ids: ['pmi', 'pmi-orders'] },
  credit: { title: '社会融资规模', label: '社会融资规模', ids: ['credit', 'credit-stock-yoy'] },
  us10y: { title: '中美 10 年期国债收益率', label: '中美 10 年期国债', ids: ['cn10y', 'us10y'] }
};
const companionIds = new Set(['pmi-orders', 'credit-stock-yoy', 'cn10y']);
const overview = shallowRef<MacroOverview>();
const selectedId = ref('pmi');
const months = ref(36);
const tablePage = ref(1);
const history = shallowRef<Record<string, MacroPoint[]>>({});
const loadingHistory = ref(false);
const refreshing = ref(false);
const overviewError = ref('');
const historyError = ref('');
const refreshError = ref('');
let timer: number | undefined;
let overviewVersion = 0;

const active = computed(() => overview.value?.indicators.find(item => item.id === selectedId.value));
const activeComparison = computed(() => comparisons[selectedId.value]);
const activeIndicators = computed(() => {
  const ids = activeComparison.value?.ids ?? [selectedId.value];
  return ids.flatMap(id => overview.value?.indicators.find(indicator => indicator.id === id) ?? []);
});
const cards = computed(() => overview.value?.indicators.filter(item => !companionIds.has(item.id)) ?? []);
const headlineLabels: Record<string, string> = { credit: '增量', us10y: '美国' };
const title = computed(() => activeComparison.value?.title ?? active.value?.name ?? '');
const busy = computed(() => refreshing.value || overview.value?.syncing);
const lastSync = computed(() => overview.value?.indicators.reduce<string | null>(
  (latest, item) => item.syncedAt && (!latest || item.syncedAt > latest) ? item.syncedAt : latest, null
));
const cutoff = computed(() => {
  const last = activeIndicators.value
    .map(item => history.value[item.id]?.at(-1)?.period ?? '').sort().at(-1);
  if (!last || months.value === 0) return '';
  const from = new Date(Date.parse(last));
  const monthly = last.length === 7;
  const day = from.getUTCDate();
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() - months.value + (monthly ? 1 : 0));
  if (monthly) return from.toISOString().slice(0, 7);
  const daysInMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getUTCDate();
  from.setUTCDate(Math.min(day, daysInMonth));
  return from.toISOString().slice(0, 10);
});
const visibleSeries = computed<MacroTrendSeries[]>(() => activeIndicators.value.map(indicator => ({
  indicator,
  points: (history.value[indicator.id] ?? []).filter(point => point.period >= cutoff.value)
})));
const allRows = computed(() => visibleSeries.value.flatMap(({ indicator, points }) =>
  points.map(point => ({ point, indicator }))
).sort((left, right) => right.point.period.localeCompare(left.point.period)));
const creditDomain = computed<[number, number] | undefined>(() => {
  const first = allRows.value.at(-1)?.point.period;
  const last = allRows.value[0]?.point.period;
  return first && last && first !== last ? [Date.parse(first), Date.parse(last)] : undefined;
});
const pageCount = computed(() => Math.max(1, Math.ceil(allRows.value.length / pageSize)));
const tableRows = computed(() => {
  const start = (tablePage.value - 1) * pageSize;
  return allRows.value.slice(start, start + pageSize);
});

watch([selectedId, months], () => { tablePage.value = 1; });
watch(pageCount, count => { tablePage.value = Math.min(tablePage.value, count); });
watch([selectedId, () => activeIndicators.value.map(item => `${item.id}:${item.syncedAt ?? ''}`).join('|'),
  () => overview.value?.releasesSyncedAt],
  async ([id, versions], previous, onCleanup) => {
    if (id !== previous[0]) history.value = {};
    if (!versions) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    loadingHistory.value = true;
    historyError.value = '';
    const indicators = activeIndicators.value;
    const results = await Promise.allSettled(indicators.map(item =>
      request<MacroPoint[]>(`${url}/${item.id}`, { signal: controller.signal })
    ));
    if (controller.signal.aborted) return;
    const next = { ...history.value };
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') next[indicators[index].id] = result.value;
      else historyError.value = '部分历史数据读取失败，请稍后重试。';
    }
    history.value = next;
    loadingHistory.value = false;
  });

function schedule(delay: number) {
  window.clearTimeout(timer);
  if (!lifetime.signal.aborted) timer = window.setTimeout(() => void loadOverview(), delay);
}

async function loadOverview() {
  const version = ++overviewVersion;
  try {
    const result = await request<MacroOverview>(url, { signal: lifetime.signal });
    if (version === overviewVersion) {
      overview.value = result;
      overviewError.value = '';
    }
  } catch {
    if (!lifetime.signal.aborted && version === overviewVersion) overviewError.value = '宏观数据暂时无法读取，请稍后重试。';
  } finally {
    if (version === overviewVersion) schedule(busy.value || overviewError.value ? 3_000 : 60_000);
  }
}

async function refresh() {
  refreshing.value = true;
  refreshError.value = '';
  window.clearTimeout(timer);
  try {
    await request(`${url}/refresh`, { method: 'POST', signal: lifetime.signal });
  } catch {
    if (!lifetime.signal.aborted) refreshError.value = '无法启动更新，请稍后重试。';
  } finally {
    refreshing.value = false;
    if (!lifetime.signal.aborted) await loadOverview();
  }
}

onMounted(loadOverview);
onUnmounted(() => {
  lifetime.abort();
  window.clearTimeout(timer);
});
</script>

<template>
  <section class="macro-page" aria-labelledby="macro-title">
    <header class="macro-heading">
      <div>
        <h1 id="macro-title">宏观数据</h1>
        <p>跟踪国内景气、物价、消费与信用，以及中美债券收益率和人民币汇率。</p>
      </div>
      <div class="macro-refresh">
        <small v-if="lastSync">最近同步 {{ clock.format(new Date(lastSync)) }}</small>
        <button type="button" class="macro-refresh-button" :disabled="busy" @click="refresh">
          <RefreshCw :size="16" aria-hidden="true" />
          {{ busy ? '更新中' : '更新数据' }}
        </button>
      </div>
    </header>

    <p v-if="overviewError || refreshError" class="macro-message" role="status">{{ refreshError || overviewError }}</p>
    <p v-else-if="!overview" class="macro-message" role="status">正在读取宏观指标…</p>

    <div v-if="overview" class="macro-cards" role="group" aria-label="宏观指标">
      <button
        v-for="item in cards"
        :key="item.id"
        type="button"
        class="macro-card"
        :aria-pressed="item.id === selectedId"
        @click="selectedId = item.id"
      >
        <span>{{ comparisons[item.id]?.label ?? item.shortName }}</span>
        <strong v-if="item.latest">
          <span v-if="headlineLabels[item.id]" class="macro-value-label">{{ headlineLabels[item.id] }}</span>
          {{ macroNumber(item.latest.value, item) }}<span :class="{ 'macro-unit': item.unit !== '%' }">{{ item.unit }}</span>
        </strong>
        <strong v-else>—</strong>
        <small>
          {{ item.latest ? macroPeriod(item.latest) : '暂无数据' }}
          <span v-if="item.failed" class="macro-failed"> · 更新失败</span>
        </small>
      </button>
    </div>

    <section v-if="active" class="macro-panel" aria-labelledby="macro-trend-title">
      <header class="macro-panel-heading">
        <div>
          <h2 id="macro-trend-title">{{ title }}</h2>
          <p>{{ active.frequency === 'monthly' ? '月度' : '日度' }}</p>
        </div>
        <div class="macro-ranges" role="group" aria-label="历史时间范围">
          <button
            v-for="range in ranges" :key="range.months" type="button"
            :aria-pressed="range.months === months" @click="months = range.months"
          >{{ range.label }}</button>
        </div>
      </header>

      <div class="macro-series-summary">
        <div v-for="item in activeIndicators" :key="item.id">
          <strong>{{ item.shortName }}</strong>
          <template v-if="item.latest">
            <span>{{ macroPeriod(item.latest) }} · {{ macroValue(item.latest.value, item) }}</span>
            <span>
              发布
              <a v-if="item.latest.releaseUrl" :href="item.latest.releaseUrl" target="_blank" rel="noopener noreferrer">{{ item.latest.releasedOn }}</a>
              <template v-else>{{ item.latest.releasedOn ?? '未核实' }}</template>
              · <a :href="item.latest.sourceUrl" target="_blank" rel="noopener noreferrer">{{ item.latest.source }}</a>
            </span>
          </template>
          <span v-else>{{ busy ? '等待同步' : '暂无数据' }}</span>
          <span v-if="item.failed" class="macro-failed">最近一次更新失败</span>
        </div>
      </div>
      <div v-if="active.id === 'credit' && allRows.length" class="macro-credit-charts">
        <section v-for="series in visibleSeries" :key="series.indicator.id">
          <h3>{{ series.indicator.name }}</h3>
          <MacroTrendChart v-if="series.points.length" :series="[series]" :title="series.indicator.name" :domain="creditDomain" compact />
          <p v-else class="macro-empty">该区间暂无数据。</p>
          <MacroIndicatorGuide :ids="[series.indicator.id]" nested />
        </section>
      </div>
      <MacroTrendChart v-else-if="allRows.length" :series="visibleSeries" :title="title" />
      <p v-else class="macro-empty" role="status">
        {{ historyError || (loadingHistory || busy ? '正在加载历史数据…' : '暂无历史数据，可手动更新。') }}
      </p>
      <p v-if="historyError && allRows.length" class="macro-message" role="status">{{ historyError }}</p>
      <p v-if="active.id === 'credit' && allRows.length" class="macro-note">两图采用相同时间轴，增量以亿元计，存量同比以百分比计。</p>
      <p v-if="active.id === 'retail'" class="macro-note">有些年份仅发布 1–2 月合计同比，合计值以 2 月为横轴位置并单独标注。</p>
      <MacroIndicatorGuide v-if="active.id !== 'credit' || !allRows.length" :ids="activeIndicators.map(item => item.id)" />
    </section>

    <section v-if="active && allRows.length" class="macro-panel macro-details" aria-labelledby="macro-details-title">
      <header class="macro-panel-heading">
        <div>
          <h2 id="macro-details-title">历史明细</h2>
          <p>共 {{ allRows.length }} 条 · “未核实”表示当前来源缺少已确认的发布日期。</p>
          <p v-if="overview?.releasesFailed && active.frequency === 'monthly'">发布日期更新失败，已保存的日期仍可查看。</p>
        </div>
        <div class="macro-pagination" v-if="pageCount > 1" aria-label="历史明细分页">
          <button type="button" aria-label="上一页" :disabled="tablePage === 1" @click="tablePage--"><ChevronLeft :size="17" /></button>
          <span aria-live="polite">{{ tablePage }} / {{ pageCount }}</span>
          <button type="button" aria-label="下一页" :disabled="tablePage === pageCount" @click="tablePage++"><ChevronRight :size="17" /></button>
        </div>
      </header>
      <div class="macro-table-scroll" tabindex="0" role="region" aria-label="历史数据表格">
        <table>
          <thead>
            <tr>
              <th scope="col">{{ active.frequency === 'monthly' ? '统计期' : '观测日' }}</th>
              <th v-if="activeComparison" scope="col">指标</th>
              <th class="macro-table-value" scope="col">数值</th>
              <th class="macro-table-date" scope="col">发布日期</th>
              <th scope="col">数据来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ point, indicator } in tableRows" :key="`${indicator.id}:${point.period}`">
              <td>{{ macroPeriod(point) }}</td>
              <td v-if="activeComparison">{{ indicator.shortName }}</td>
              <td class="macro-table-value">{{ macroValue(point.value, indicator) }}</td>
              <td class="macro-table-date">
                <a v-if="point.releaseUrl" :href="point.releaseUrl" target="_blank" rel="noopener noreferrer">{{ point.releasedOn }}</a>
                <span v-else>{{ point.releasedOn ?? '未核实' }}</span>
              </td>
              <td><a :href="point.sourceUrl" target="_blank" rel="noopener noreferrer">{{ point.source }}</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<style scoped>
.macro-page {
  display: grid; gap: 20px; min-width: 0; width: 100%; max-width: 1560px;
  margin-inline: auto; padding: clamp(14px, 2.4vw, 32px);
}
.macro-heading, .macro-panel-heading, .macro-refresh, .macro-pagination {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
}
.macro-heading h1 { font-size: clamp(25px, 3vw, 34px); margin: 0; }
.macro-heading p, .macro-panel-heading p { color: var(--muted); font-size: 13px; margin: 6px 0 0; line-height: 1.6; }
.macro-refresh small, .macro-pagination { color: var(--muted); font-size: 12px; }
.macro-refresh-button {
  display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--blue-strong);
  border-radius: 8px; padding: 8px 12px; color: white; background: var(--blue-strong);
}
.macro-refresh-button:disabled { opacity: .72; cursor: wait; }
.macro-cards { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
.macro-card {
  display: grid; gap: 8px; align-content: start; text-align: left; min-width: 0; padding: 13px;
  border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface);
}
.macro-card:hover { border-color: #8aa9da; }
.macro-card[aria-pressed="true"] { border-color: #537fc9; background: #eff5ff; box-shadow: inset 0 2px #537fc9; }
.macro-card > span { font-size: 13px; }
.macro-card strong { font-size: clamp(15px, 1.4vw, 21px); font-variant-numeric: tabular-nums; }
.macro-card .macro-unit { margin-left: 4px; font-size: 11px; font-weight: 500; color: var(--muted); white-space: nowrap; }
.macro-value-label { margin-right: 4px; font-size: 11px; font-weight: 500; color: var(--muted); }
.macro-card small, .macro-note { color: var(--muted); font-size: 12px; }
.macro-failed, .macro-message { color: #873d13; }
.macro-message, .macro-note { margin: 0; padding: 0 4px; line-height: 1.6; }
.macro-panel {
  padding: clamp(12px, 2vw, 22px); min-width: 0; border: 1px solid var(--line);
  border-radius: 12px; background: var(--surface);
}
.macro-panel-heading h2 { font-size: 18px; margin: 0; }
.macro-panel a { color: var(--blue-strong); text-underline-offset: 2px; }
.macro-series-summary { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.macro-series-summary > div {
  display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline;
  padding: 8px 10px; background: var(--surface-soft); border-radius: 7px; font-size: 12px; color: var(--muted);
}
.macro-series-summary strong { color: var(--text); }
.macro-credit-charts { display: grid; gap: 12px; margin-top: 14px; }
.macro-credit-charts h3 { margin: 0; font-size: 14px; }
.macro-credit-charts section + section { border-top: 1px solid var(--line); padding-top: 14px; }
.macro-ranges { display: flex; flex-wrap: wrap; gap: 4px; background: var(--surface-soft); padding: 4px; border-radius: 8px; }
.macro-ranges button, .macro-pagination button {
  border: 1px solid transparent; border-radius: 6px; padding: 5px 8px; color: var(--muted); background: transparent; font-size: 13px;
}
.macro-ranges button[aria-pressed="true"] { border-color: var(--line); color: #173a70; background: var(--surface); }
.macro-pagination button { display: inline-flex; border-color: var(--line); }
.macro-pagination button:disabled { opacity: .45; cursor: default; }
.macro-empty { text-align: center; color: var(--muted); padding: 60px 0; }
.macro-table-scroll { overflow-x: auto; margin-top: 14px; }
.macro-details table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
.macro-details th, .macro-details td { padding: 9px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.macro-details th { background: var(--surface-soft); color: var(--muted); font-weight: 600; }
.macro-table-value { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 1200px) { .macro-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 620px) {
  .macro-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .macro-page { gap: 14px; }
  .macro-details th, .macro-details td { padding: 8px 4px; font-size: 12px; white-space: normal; }
  .macro-details .macro-table-date { white-space: nowrap; }
}
</style>
