<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import type { CompanySearchResult, PeerComparison, PeerCompany } from '../types/finance';
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

function positionValue(value: number | null, unit?: string): string {
  if (unit === '%') return formatPercent(value);
  return formatNumber(value);
}

const rankingUniverse = computed(() => Math.max(
  0,
  ...(props.comparison?.rankings.map((ranking) => ranking.total) ?? [])
));

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
        <div class="peer-table-wrap">
          <table class="peer-table">
            <caption>目标公司固定在首行；排名口径以标题区有效样本为准</caption>
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
                  <strong>{{ peer.name }} <b v-if="peer.isSelected">当前</b></strong>
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
