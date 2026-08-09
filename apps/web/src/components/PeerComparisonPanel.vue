<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-vue-next';
import type { CompanySearchResult, PeerComparison, PeerCompany } from '../types/finance';
import { buildIndustryPositions } from '../finance/industry-position';
import PeerFinancialComparison from './PeerFinancialComparison.vue';

type PeerQuoteMetricKey = 'changePercent' | 'turnoverRate' | 'pe' | 'pb';
type PeerTableSortKey = 'latestPrice' | PeerQuoteMetricKey;

const quoteMetricOptions: Array<{ key: PeerQuoteMetricKey; label: string }> = [
  { key: 'pe', label: '动态 PE' },
  { key: 'pb', label: 'PB' },
  { key: 'changePercent', label: '涨跌幅' },
  { key: 'turnoverRate', label: '换手率' }
];

const props = defineProps<{
  company: CompanySearchResult | null;
  comparison: PeerComparison | null;
  loading: boolean;
  error: string | null;
}>();

const expanded = ref(false);
const activeQuoteMetric = ref<PeerQuoteMetricKey>('pe');
const sortKey = ref<PeerTableSortKey>('pe');
const sortDirection = ref<'asc' | 'desc'>('asc');
const nearbyOnly = ref(false);
const industryPositions = computed(() => buildIndustryPositions(props.comparison));

watch(
  () => props.company ? `${props.company.market}:${props.company.symbol}` : '',
  () => {
    expanded.value = false;
  }
);

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `${formatted}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false
  });
}

function positionValue(value: number | null, unit?: string): string {
  if (unit === '%') return formatPercent(value);
  return formatNumber(value);
}

const rankingUniverse = computed(() => Math.max(
  0,
  ...(props.comparison?.rankings.map((ranking) => ranking.total) ?? [])
));

const activeBenchmark = computed(() => props.comparison?.benchmarks?.find(
  (benchmark) => benchmark.key === activeQuoteMetric.value
) ?? null);

const activeQuotePosition = computed(() => industryPositions.value.find(
  (position) => position.key === activeQuoteMetric.value
) ?? null);

const visiblePeers = computed(() => {
  const peers = [...(props.comparison?.peers ?? [])];
  const selected = peers.find((peer) => peer.isSelected);
  let others = peers.filter((peer) => !peer.isSelected);
  if (nearbyOnly.value && selected) {
    const selectedValue = numericPeerValue(selected, activeQuoteMetric.value);
    if (selectedValue !== null) {
      others = others
        .filter((peer) => numericPeerValue(peer, activeQuoteMetric.value) !== null)
        .sort((left, right) => (
          Math.abs((numericPeerValue(left, activeQuoteMetric.value) as number) - selectedValue) -
          Math.abs((numericPeerValue(right, activeQuoteMetric.value) as number) - selectedValue)
        ))
        .slice(0, 6);
    }
  }
  others.sort((left, right) => comparePeers(left, right, sortKey.value, sortDirection.value));
  return selected ? [selected, ...others] : others;
});

function changeClass(value: number | null | undefined) {
  return {
    up: Number(value ?? 0) > 0,
    down: Number(value ?? 0) < 0
  };
}

function companyKey(company: PeerCompany): string {
  return `${company.market}:${company.symbol}`;
}

function companyHref(company: PeerCompany): string {
  return `?market=${encodeURIComponent(company.market)}&symbol=${encodeURIComponent(company.symbol)}`;
}

function numericPeerValue(company: PeerCompany, key: PeerTableSortKey): number | null {
  const value = company[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function comparePeers(
  left: PeerCompany,
  right: PeerCompany,
  key: PeerTableSortKey,
  direction: 'asc' | 'desc'
): number {
  const leftValue = numericPeerValue(left, key);
  const rightValue = numericPeerValue(right, key);
  if (leftValue === null) return rightValue === null ? 0 : 1;
  if (rightValue === null) return -1;
  return (leftValue - rightValue) * (direction === 'asc' ? 1 : -1);
}

function sortPeersBy(key: PeerTableSortKey): void {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDirection.value = key === 'pe' || key === 'pb' ? 'asc' : 'desc';
  }
  if (key !== 'latestPrice') activeQuoteMetric.value = key;
}

function selectQuoteMetric(key: PeerQuoteMetricKey): void {
  activeQuoteMetric.value = key;
  if (sortKey.value === key) return;
  sortKey.value = key;
  sortDirection.value = key === 'pe' || key === 'pb' ? 'asc' : 'desc';
}

function sortAria(key: PeerTableSortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none';
  return sortDirection.value === 'asc' ? 'ascending' : 'descending';
}

function distributionPosition(value: number | null | undefined): string {
  const benchmark = activeBenchmark.value;
  if (value === null || value === undefined || !benchmark || benchmark.min === null || benchmark.max === null) {
    return '50%';
  }
  if (benchmark.max === benchmark.min) return '50%';
  const share = Math.max(0, Math.min(1, (value - benchmark.min) / (benchmark.max - benchmark.min)));
  return `${(share * 100).toFixed(2)}%`;
}
</script>

<template>
  <section class="peer-panel">
    <div class="peer-head">
      <div>
        <span>同行对比</span>
        <h3>{{ comparison?.industry?.name ?? company?.name ?? '同行公司' }}</h3>
      </div>
      <div class="peer-head-actions">
        <button
          type="button"
          :aria-expanded="expanded"
          aria-controls="peer-comparison-content"
          @click="expanded = !expanded"
        >
          <ChevronUp v-if="expanded" :size="16" />
          <ChevronDown v-else :size="16" />
          {{ expanded ? '收起同行对比' : '展开同行对比' }}
        </button>
      </div>
    </div>

    <div v-if="loading && !comparison" class="peer-experience-status" role="status" aria-live="polite">
      <span class="peer-status-dot loading"></span>
      <strong>正在更新同行数据</strong>
      <small>摘要准备好后会直接显示，无需展开等待</small>
    </div>
    <div v-else-if="error && !comparison" class="peer-experience-status error" role="alert">
      <span class="peer-status-dot"></span>
      <strong>同行数据暂时不可用</strong>
      <small>{{ error }}；可使用页面刷新按钮重试</small>
    </div>

    <div v-if="comparison" class="peer-universe-strip">
      <span>{{ comparison.peers.length }} 家展示</span>
      <strong>{{ rankingUniverse }} 家排名样本</strong>
      <small>
        {{ comparison.cache?.hit ? '来自本地缓存' : '刚刚更新' }}
        · {{ formatDate(comparison.cache?.refreshedAt ?? comparison.fetchedAt) }}
        · {{ comparison.industry?.source ?? comparison.source }}
      </small>
    </div>

    <div v-if="industryPositions.length" class="industry-position-grid" aria-label="行业相对位置">
      <article
        v-for="position in industryPositions"
        :key="position.key"
        :class="position.band"
        :title="position.context"
      >
        <span>{{ position.label }}</span>
        <strong>{{ position.percentileLabel }}</strong>
        <em class="peer-position-value">
          当前 {{ positionValue(position.value, position.unit) }}
          <template v-if="position.benchmark?.median !== null && position.benchmark?.median !== undefined">
            · 行业中位数 {{ positionValue(position.benchmark.median, position.unit) }}
          </template>
        </em>
        <small>{{ position.rankLabel }} · {{ position.sampleLabel }}</small>
        <p>{{ position.context }}</p>
      </article>
    </div>

    <div v-if="expanded" id="peer-comparison-content" class="peer-collapsible-content">
      <div v-if="loading" class="peer-state">正在通过 AKShare 拉取同行公司...</div>
      <div v-else-if="error" class="peer-state error">{{ error }}</div>
      <div v-else-if="comparison?.note" class="peer-state">{{ comparison.note }}</div>

      <template v-if="comparison && comparison.peers.length">
        <section class="peer-market-detail" aria-labelledby="peer-market-detail-title">
          <div class="peer-market-detail-head">
            <div>
              <span>市场横截面</span>
              <h4 id="peer-market-detail-title">{{ activeQuotePosition?.label ?? '行情指标' }}分布</h4>
            </div>
            <div class="peer-quote-tabs" aria-label="市场对比指标">
              <button
                v-for="option in quoteMetricOptions"
                :key="option.key"
                :class="{ active: activeQuoteMetric === option.key }"
                type="button"
                @click="selectQuoteMetric(option.key)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="activeBenchmark?.count" class="peer-distribution">
            <div class="peer-distribution-labels">
              <span>低 {{ positionValue(activeBenchmark.min, activeBenchmark.unit) }}</span>
              <strong>中位数 {{ positionValue(activeBenchmark.median, activeBenchmark.unit) }}</strong>
              <span>高 {{ positionValue(activeBenchmark.max, activeBenchmark.unit) }}</span>
            </div>
            <div class="peer-distribution-track" aria-hidden="true">
              <span class="range"></span>
              <i class="quartile q1" :style="{ left: distributionPosition(activeBenchmark.q1) }"></i>
              <i class="quartile median" :style="{ left: distributionPosition(activeBenchmark.median) }"></i>
              <i class="quartile q3" :style="{ left: distributionPosition(activeBenchmark.q3) }"></i>
              <b :style="{ left: distributionPosition(activeQuotePosition?.value) }">当前</b>
            </div>
            <p>{{ activeQuotePosition?.context }}</p>
          </div>
        </section>

        <div class="peer-table-tools">
          <span>目标公司固定在首行，点击表头可排序</span>
          <button
            :class="{ active: nearbyOnly }"
            type="button"
            :aria-pressed="nearbyOnly"
            @click="nearbyOnly = !nearbyOnly"
          >
            {{ nearbyOnly ? '显示全部公司' : '仅看数值相近公司' }}
          </button>
        </div>

        <div class="peer-table-wrap">
          <table class="peer-table">
            <caption>当前显示 {{ visiblePeers.length }} 家；排名口径以标题区有效样本为准</caption>
            <thead>
              <tr>
                <th>公司</th>
                <th :aria-sort="sortAria('latestPrice')">
                  <button type="button" @click="sortPeersBy('latestPrice')">
                    最新价
                    <ArrowUp v-if="sortKey === 'latestPrice' && sortDirection === 'asc'" :size="13" />
                    <ArrowDown v-else-if="sortKey === 'latestPrice'" :size="13" />
                    <ArrowUpDown v-else :size="13" />
                  </button>
                </th>
                <th
                  v-for="option in quoteMetricOptions.filter((item) => item.key !== 'pe' && item.key !== 'pb')"
                  :key="option.key"
                  :aria-sort="sortAria(option.key)"
                >
                  <button type="button" @click="sortPeersBy(option.key)">
                    {{ option.label }}
                    <ArrowUp v-if="sortKey === option.key && sortDirection === 'asc'" :size="13" />
                    <ArrowDown v-else-if="sortKey === option.key" :size="13" />
                    <ArrowUpDown v-else :size="13" />
                  </button>
                </th>
                <th v-for="option in quoteMetricOptions.filter((item) => item.key === 'pe' || item.key === 'pb')" :key="option.key" :aria-sort="sortAria(option.key)">
                  <button type="button" @click="sortPeersBy(option.key)">
                    {{ option.label }}
                    <ArrowUp v-if="sortKey === option.key && sortDirection === 'asc'" :size="13" />
                    <ArrowDown v-else-if="sortKey === option.key" :size="13" />
                    <ArrowUpDown v-else :size="13" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="peer in visiblePeers"
                :key="companyKey(peer)"
                :class="{ selected: peer.isSelected }"
              >
                <th>
                  <strong>
                    <span v-if="peer.isSelected">{{ peer.name }}</span>
                    <a v-else :href="companyHref(peer)">{{ peer.name }}</a>
                    <b v-if="peer.isSelected">当前</b>
                  </strong>
                  <span>{{ peer.displaySymbol }}</span>
                </th>
                <td>{{ formatNumber(peer.latestPrice) }}</td>
                <td :class="changeClass(peer.changePercent)">{{ formatPercent(peer.changePercent) }}</td>
                <td>{{ formatPercent(peer.turnoverRate) }}</td>
                <td>{{ formatNumber(peer.pe) }}</td>
                <td>{{ formatNumber(peer.pb) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <PeerFinancialComparison :company="company" :peers="comparison" />
      </template>
    </div>
  </section>
</template>
