<script setup lang="ts">
import type { CompanySearchResult, PeerComparison, PeerCompany, PeerRanking } from '../types/finance';

defineProps<{
  company: CompanySearchResult | null;
  comparison: PeerComparison | null;
  loading: boolean;
  error: string | null;
}>();

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
      <small>{{ comparison?.industry?.source ?? comparison?.source ?? 'AKShare' }}</small>
    </div>

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
  </section>
</template>
