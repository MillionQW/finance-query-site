<script setup lang="ts">
import {
  ArrowLeft,
  Database,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  TrendingUp
} from 'lucide-vue-next';
import type { AppView } from '../app/app-navigation';
import { searchOptionId } from '../app/app-navigation';
import type { CompanySearchResult, MarketFilter } from '../types/finance';

defineProps<{
  currentView: AppView;
  companies: CompanySearchResult[];
  selectedCompany: CompanySearchResult | null;
  searchLoading: boolean;
  searchError: string | null;
  showSearchDropdown: boolean;
  activeSearchDescendant?: string;
  marketOptions: Array<{ value: MarketFilter; label: string }>;
  selectedIsFavorite: boolean;
  favoriteLoading: boolean;
}>();

const query = defineModel<string>('query', { required: true });
const market = defineModel<MarketFilter>('market', { required: true });
const activeSearchIndex = defineModel<number>('activeSearchIndex', { required: true });

defineEmits<{
  openSearch: [];
  searchFocusOut: [event: FocusEvent];
  searchInput: [];
  searchEnter: [];
  moveSearch: [direction: 1 | -1];
  closeSearch: [];
  submitSearch: [];
  selectMarket: [market: MarketFilter];
  selectCompany: [company: CompanySearchResult];
  navigate: [view: AppView];
  refreshCompany: [];
  toggleFavorite: [];
}>();
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark"><Database :size="18" /></span>
      <strong>财报查询台</strong>
    </div>

    <div
      v-if="currentView === 'company'"
      class="search-shell"
      @focusin="$emit('openSearch')"
      @focusout="$emit('searchFocusOut', $event)"
    >
      <div class="global-search">
        <Search :size="20" />
        <input
          v-model="query"
          type="search"
          placeholder="公司/代码，例如：腾讯、00700、600519"
          aria-label="搜索公司或股票代码"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="showSearchDropdown"
          aria-controls="company-search-results"
          :aria-activedescendant="activeSearchDescendant"
          @input="$emit('searchInput')"
          @keydown.enter.prevent="$emit('searchEnter')"
          @keydown.down.prevent="$emit('moveSearch', 1)"
          @keydown.up.prevent="$emit('moveSearch', -1)"
          @keydown.esc.prevent="$emit('closeSearch')"
        />
        <button
          type="button"
          :aria-disabled="searchLoading"
          :aria-busy="searchLoading"
          @click="!searchLoading && $emit('submitSearch')"
        >
          <Loader2 v-if="searchLoading" class="spin-icon" :size="15" />
          <span>{{ searchLoading ? '搜索中' : '搜索' }}</span>
        </button>
      </div>

      <div v-if="showSearchDropdown" class="search-dropdown">
        <div class="search-market-tabs" aria-label="市场筛选">
          <button
            v-for="item in marketOptions"
            :key="item.value"
            :class="{ active: market === item.value }"
            type="button"
            :aria-pressed="market === item.value"
            @click="$emit('selectMarket', item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <div v-if="searchLoading" class="search-dropdown-state searching">
          <Loader2 class="spin-icon" :size="16" />
          <span>正在从 AKShare 搜索公司...</span>
        </div>
        <div v-else-if="searchError" class="search-dropdown-state error">
          {{ searchError }}
        </div>
        <div
          v-else-if="companies.length"
          id="company-search-results"
          class="search-results"
          role="listbox"
          aria-label="搜索结果"
        >
          <button
            v-for="(company, index) in companies"
            :id="searchOptionId(company)"
            :key="`${company.market}-${company.symbol}`"
            class="search-result-row"
            :class="{
              active:
                activeSearchIndex === index ||
                (selectedCompany?.market === company.market && selectedCompany?.symbol === company.symbol)
            }"
            type="button"
            role="option"
            :aria-selected="activeSearchIndex === index"
            @mouseenter="activeSearchIndex = index"
            @click="$emit('selectCompany', company)"
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
        </div>
        <div v-else class="search-dropdown-state">暂无搜索结果</div>
      </div>
    </div>

    <div v-else class="settings-topbar-title">
      <Settings v-if="currentView === 'settings'" :size="18" />
      <SlidersHorizontal v-else-if="currentView === 'screener'" :size="18" />
      <TrendingUp v-else :size="18" />
      <strong v-if="currentView === 'settings'">系统设置</strong>
      <strong v-else-if="currentView === 'etf'">ETF 研究</strong>
      <strong v-else-if="currentView === 'index'">指数研究</strong>
      <strong v-else-if="currentView === 'portfolio'">持仓估值表</strong>
      <strong v-else>ROA/PE 筛选</strong>
    </div>

    <nav class="top-actions" aria-label="工具">
      <button v-if="currentView !== 'portfolio'" class="ghost-button" type="button" @click="$emit('navigate', 'portfolio')">
        <TrendingUp :size="17" />持仓
      </button>
      <template v-if="currentView === 'company'">
        <button class="ghost-button" type="button" @click="$emit('navigate', 'screener')">
          <SlidersHorizontal :size="17" />筛选
        </button>
        <button class="ghost-button" type="button" @click="$emit('navigate', 'etf')">
          <TrendingUp :size="17" />ETF
        </button>
        <button class="ghost-button" type="button" @click="$emit('navigate', 'index')">
          <TrendingUp :size="17" />指数
        </button>
        <button class="ghost-button" type="button" title="刷新财报" @click="$emit('refreshCompany')">
          <RefreshCw :size="17" />刷新
        </button>
        <button
          class="ghost-button"
          :class="{ 'favorite-active': selectedIsFavorite }"
          type="button"
          :title="favoriteLoading ? '保存中' : selectedIsFavorite ? '取消收藏' : '收藏'"
          :disabled="!selectedCompany || favoriteLoading"
          @click="$emit('toggleFavorite')"
        >
          <Star :size="17" />{{ favoriteLoading ? '保存中' : selectedIsFavorite ? '已收藏' : '收藏' }}
        </button>
        <button
          class="icon-button dark"
          type="button"
          title="设置"
          aria-label="打开设置"
          @click="$emit('navigate', 'settings')"
        >
          <Settings :size="17" />
        </button>
      </template>

      <template v-else-if="currentView !== 'settings'">
        <button v-if="currentView !== 'etf'" class="ghost-button" type="button" @click="$emit('navigate', 'etf')">
          <TrendingUp :size="17" />ETF
        </button>
        <button v-if="currentView !== 'index'" class="ghost-button" type="button" @click="$emit('navigate', 'index')">
          <TrendingUp :size="17" />指数
        </button>
        <button v-if="currentView !== 'screener'" class="ghost-button" type="button" @click="$emit('navigate', 'screener')">
          <SlidersHorizontal :size="17" />筛选
        </button>
        <button class="ghost-button" type="button" @click="$emit('navigate', 'company')">
          <ArrowLeft :size="17" />个股
        </button>
      </template>

      <button v-else class="ghost-button" type="button" @click="$emit('navigate', 'company')">
        <ArrowLeft :size="17" />返回财报
      </button>
    </nav>
  </header>
</template>
