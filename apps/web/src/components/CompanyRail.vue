<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next';
import type { CompanySearchResult, MarketFilter } from '../types/finance';

defineProps<{
  companies: CompanySearchResult[];
  selected?: CompanySearchResult | null;
  loading: boolean;
  market: MarketFilter;
  error?: string | null;
}>();

const emit = defineEmits<{
  select: [company: CompanySearchResult];
  refresh: [];
  changeMarket: [market: MarketFilter];
}>();

const markets: { value: MarketFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'a', label: 'A股' },
  { value: 'hk', label: '港股' }
];
</script>

<template>
  <aside class="company-rail">
    <div class="segments" aria-label="市场筛选">
      <button
        v-for="item in markets"
        :key="item.value"
        :class="{ active: market === item.value }"
        type="button"
        @click="emit('changeMarket', item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="rail-head">
      <div>
        <p class="section-label">搜索结果</p>
        <strong>{{ companies.length }}</strong>
      </div>
      <button class="icon-button" type="button" title="刷新搜索" @click="emit('refresh')">
        <RefreshCw :size="17" />
      </button>
    </div>

    <p v-if="error" class="rail-error">{{ error }}</p>

    <div class="company-list" aria-live="polite">
      <button
        v-for="company in companies"
        :key="`${company.market}-${company.symbol}`"
        class="company-row"
        :class="{ active: selected?.market === company.market && selected?.symbol === company.symbol }"
        type="button"
        @click="emit('select', company)"
      >
        <span class="company-logo" :data-market="company.market">{{ company.name.slice(0, 1) }}</span>
        <span class="company-main">
          <strong>{{ company.name }}</strong>
          <span>
            {{ company.displaySymbol }}
            <small>{{ company.market === 'hk' ? 'HK' : 'A' }}</small>
          </span>
        </span>
        <span class="company-quote">
          <span v-if="company.latestPrice !== null && company.latestPrice !== undefined">
            {{ company.latestPrice }}
          </span>
          <em
            v-if="company.changePercent !== null && company.changePercent !== undefined"
            :class="{ up: Number(company.changePercent) > 0, down: Number(company.changePercent) < 0 }"
          >
            {{ Number(company.changePercent).toFixed(2) }}%
          </em>
        </span>
      </button>

      <div v-if="loading" class="rail-placeholder">正在从 AKShare 搜索公司...</div>
      <div v-else-if="!companies.length && !error" class="rail-placeholder">输入公司名或代码开始查询</div>
    </div>
  </aside>
</template>
