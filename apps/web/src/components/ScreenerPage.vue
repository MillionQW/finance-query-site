<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { AlertTriangle, Loader2, RefreshCw, Search, SlidersHorizontal } from 'lucide-vue-next';
import { getScreenerResults } from '../services/api';
import type { ScreenerCompany, ScreenerResult } from '../types/finance';

const market = ref<'all' | 'a' | 'hk'>('all');
const scope = ref('a:000300');
const maxPe = ref(16);
const minMarketCapBillion = ref(0);
const limit = ref(80);
const maxCandidates = ref(30);
const requestGapMs = ref(1000);
const excludeBanks = ref(true);
const result = ref<ScreenerResult | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const marketOptions: Array<{ value: 'all' | 'a' | 'hk'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'a', label: 'A股' },
  { value: 'hk', label: '港股' }
];

const scopeOptions = [
  { value: 'all', label: '全市场' },
  { value: 'a:000300', label: '沪深300' },
  { value: 'a:000001', label: '上证指数' },
  { value: 'a:000688', label: '科创50' },
  { value: 'a:000905', label: '中证500' },
  { value: 'hk:hsi', label: '恒生指数' },
  { value: 'hk:hstech', label: '恒生科技' }
];

const items = computed(() => result.value?.items ?? []);

onMounted(() => {
  void runScreener();
});

async function runScreener(refresh = false): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    result.value = await getScreenerResults({
      markets: market.value,
      scope: scope.value,
      maxPe: maxPe.value,
      minMarketCapBillion: minMarketCapBillion.value,
      limit: limit.value,
      maxCandidates: maxCandidates.value,
      requestGapMs: requestGapMs.value,
      peOnly: true,
      excludeBanks: excludeBanks.value,
      refresh
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '筛选请求失败';
    error.value = message.includes('timed out')
      ? 'AKShare 数据源响应超时；可以缩小市场范围或降低候选数量后重试。'
      : message;
  } finally {
    loading.value = false;
  }
}

function companyUrl(company: ScreenerCompany): string {
  const params = new URLSearchParams({
    market: company.market,
    symbol: company.symbol
  });
  return `${window.location.pathname}?${params.toString()}`;
}

function marketLabel(value: string): string {
  if (value === 'a') return 'A股';
  if (value === 'hk') return '港股';
  return value;
}

function number(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(value);
}

function date(value: string | null | undefined): string {
  if (!value) return '-';
  return String(value).slice(0, 10);
}
</script>

<template>
  <section class="screener-page">
    <header class="screener-head">
      <div>
        <span>AKShare 条件筛选</span>
        <h1>低 PE 公司</h1>
        <p>直接使用行情候选里的市盈率筛选，减少逐只读取财务指标造成的超时和空响应。</p>
      </div>
      <button class="ghost-button blue" type="button" :disabled="loading" @click="runScreener(true)">
        <Loader2 v-if="loading" class="spin-icon" :size="16" />
        <RefreshCw v-else :size="16" />
        {{ loading ? '筛选中' : '重新筛选' }}
      </button>
    </header>

    <section class="screener-controls" aria-label="筛选条件">
      <div class="screener-segments">
        <button
          v-for="option in marketOptions"
          :key="option.value"
          type="button"
          :class="{ active: market === option.value }"
          @click="market = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <label>
        <span>筛选范围</span>
        <select v-model="scope">
          <option v-for="option in scopeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <label>
        <span>PE 不高于</span>
        <input v-model.number="maxPe" type="number" min="0" max="200" step="0.5" />
        <small>倍</small>
      </label>
      <label>
        <span>市值不低于</span>
        <input v-model.number="minMarketCapBillion" type="number" min="0" max="100000" step="50" />
        <small>亿</small>
      </label>
      <label>
        <span>返回数量</span>
        <input v-model.number="limit" type="number" min="1" max="300" step="1" />
      </label>
      <label>
        <span>每市场候选</span>
        <input v-model.number="maxCandidates" type="number" min="1" max="800" step="10" />
      </label>
      <label>
        <span>请求间隔</span>
        <input v-model.number="requestGapMs" type="number" min="0" max="10000" step="500" />
        <small>ms</small>
      </label>
      <label class="screener-checkbox">
        <input v-model="excludeBanks" type="checkbox" />
        <span>排除银行</span>
      </label>
      <button class="screener-run" type="button" :disabled="loading" @click="runScreener(true)">
        <Search :size="16" />
        开始
      </button>
    </section>

    <div v-if="error" class="status-banner">
      <AlertTriangle :size="18" />
      <span>{{ error }}</span>
    </div>

    <section class="screener-summary">
      <div>
        <span>命中公司</span>
        <strong>{{ result?.summary.matched ?? 0 }}</strong>
      </div>
      <div>
        <span>扫描候选</span>
        <strong>{{ result?.summary.scannedCandidates ?? 0 }}</strong>
      </div>
      <div>
        <span>筛选方式</span>
        <strong>{{ result?.cache?.hit ? '缓存' : '实时' }} / 仅 PE{{ result?.params.excludeBanks ? ' / 无银行' : '' }}</strong>
      </div>
      <div>
        <span>更新时间</span>
        <strong>{{ date(result?.fetchedAt) }}</strong>
      </div>
    </section>

    <section class="screener-result-panel">
      <header>
        <div>
          <span><SlidersHorizontal :size="15" />筛选结果</span>
          <h2>PE ≤ {{ number(result?.params.maxPe ?? maxPe) }} 倍</h2>
        </div>
        <small>{{ result?.source ?? 'AKShare screener' }}</small>
      </header>

      <div v-if="loading" class="loading-panel">
        <Loader2 class="spin-icon" :size="18" />
        正在读取 AKShare 行情候选...
      </div>
      <div v-else-if="!items.length" class="screener-empty">
        暂无符合条件的公司。可以提高 PE 上限或增加候选扫描数量再试一次。
      </div>
      <div v-else class="screener-table-wrap">
        <table class="screener-table">
          <thead>
            <tr>
              <th>公司</th>
              <th>市场</th>
              <th>最新价</th>
              <th>涨跌幅</th>
              <th>PE</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="company in items" :key="`${company.market}-${company.symbol}`">
              <th>
                <a class="screener-company-link" :href="companyUrl(company)" target="_blank" rel="noopener noreferrer">
                  {{ company.name }}
                </a>
                <small>{{ company.displaySymbol }}</small>
              </th>
              <td>{{ marketLabel(company.market) }}</td>
              <td>{{ number(company.latestPrice) }}</td>
              <td :class="{ up: (company.changePercent ?? 0) > 0, down: (company.changePercent ?? 0) < 0 }">
                {{ company.changePercent === null || company.changePercent === undefined ? '-' : `${number(company.changePercent)}%` }}
              </td>
              <td>{{ number(company.pe) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <details v-if="result?.warnings.length" class="screener-warnings">
        <summary>{{ result.summary.warnings }} 条读取提示</summary>
        <ul>
          <li v-for="warning in result.warnings.slice(0, 12)" :key="warning">{{ warning }}</li>
        </ul>
      </details>
    </section>
  </section>
</template>
