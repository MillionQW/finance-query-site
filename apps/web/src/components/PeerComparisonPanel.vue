<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import type { CompanySearchResult, PeerComparison, PeerCompany, PeerRanking } from '../types/finance';
import { buildIndustryPositions } from '../finance/industry-position';

const props = defineProps<{
  company: CompanySearchResult | null;
  comparison: PeerComparison | null;
  loading: boolean;
  error: string | null;
}>();

const expanded = ref(false);
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

function formatRank(ranking: PeerRanking): string {
  if (!ranking.rank || !ranking.total) {
    return '-';
  }
  return `${ranking.rank} / ${ranking.total}`;
}

function metricValue(ranking: PeerRanking): string {
  if (ranking.unit === '%') {
    return formatPercent(ranking.value);
  }
  return formatNumber(ranking.value);
}

function changeClass(value: number | null | undefined) {
  return {
    up: Number(value ?? 0) > 0,
    down: Number(value ?? 0) < 0
  };
}

function companyKey(company: PeerCompany): string {
  return `${company.market}:${company.symbol}`;
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
        <small>{{ comparison?.industry?.source ?? comparison?.source ?? 'AKShare' }}</small>
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

    <div v-if="comparison?.cache" class="peer-cache-strip">
      <span>同行数据</span>
      <strong>{{ comparison.cache.hit ? '本地缓存' : '刚刚更新' }}</strong>
      <small>缓存刷新：{{ formatDate(comparison.cache.refreshedAt) }}</small>
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
        <em>{{ position.rankLabel }}</em>
        <small>{{ position.context }}</small>
      </article>
    </div>

    <div v-if="expanded" id="peer-comparison-content" class="peer-collapsible-content">
      <div v-if="loading" class="peer-state">正在通过 AKShare 拉取同行公司...</div>
      <div v-else-if="error" class="peer-state error">{{ error }}</div>
      <div v-else-if="comparison?.note" class="peer-state">{{ comparison.note }}</div>

      <template v-if="comparison && comparison.peers.length">
        <div class="peer-rank-grid">
          <article v-for="ranking in comparison.rankings" :key="ranking.key">
            <span>{{ ranking.label }}</span>
            <strong>{{ formatRank(ranking) }}</strong>
            <em>{{ metricValue(ranking) }}</em>
          </article>
        </div>

        <div class="peer-table-wrap">
          <table class="peer-table">
            <thead>
              <tr>
                <th>公司</th>
                <th>最新价</th>
                <th>涨跌幅</th>
                <th>换手率</th>
                <th>动态 PE</th>
                <th>PB</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="peer in comparison.peers"
                :key="companyKey(peer)"
                :class="{ selected: peer.isSelected }"
              >
                <th>
                  <strong>{{ peer.name }}</strong>
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
      </template>
    </div>
  </section>
</template>
