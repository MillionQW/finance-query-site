<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import {
  AlertTriangle,
  Clock3,
  Download,
  Loader2,
  RefreshCw,
  Star,
  StickyNote,
  TrendingUp
} from 'lucide-vue-next';
import AnnouncementPanel from './AnnouncementPanel.vue';
import { companyKey } from '../app/app-navigation';
import { formatDate, formatNumber, marketLabel } from '../app/app-formatters';
import type {
  AnnouncementFeed,
  CacheEntry,
  CompanyInsight,
  CompanySearchResult,
  FavoriteCompany,
  FinancialStatements,
  MetricSeries,
  PeerComparison,
  PeerMetricComparison,
  StatementTable,
  StatementType
} from '../types/finance';

const CustomMetricChart = defineAsyncComponent(() => import('./CustomMetricChart.vue'));
const MiniTrend = defineAsyncComponent(() => import('./MiniTrend.vue'));
const PeerComparisonPanel = defineAsyncComponent(() => import('./PeerComparisonPanel.vue'));
const PeerMetricChart = defineAsyncComponent(() => import('./PeerMetricChart.vue'));
const StatementTable = defineAsyncComponent(() => import('./StatementTable.vue'));

defineProps<{
  favorites: FavoriteCompany[];
  visibleRecentCompanies: CompanySearchResult[];
  selectedCompany: CompanySearchResult | null;
  activeCompanyInsight: CompanyInsight;
  noteDialogOpen: boolean;
  buyPointEditing: boolean;
  showBuyPointReminder: boolean;
  statements: FinancialStatements | null;
  statementCacheLabel: string;
  announcementFeed: AnnouncementFeed | null;
  announcementLoading: boolean;
  announcementError: string | null;
  statementLoading: boolean;
  statementError: string | null;
  availableYears: string[];
  activeYears: string[];
  summaryCards: Array<MetricSeries & { latest: number | null; delta: number | null }>;
  peerComparison: PeerComparison | null;
  peerLoading: boolean;
  peerError: string | null;
  peerMetricComparison: PeerMetricComparison | null;
  peerMetricLoading: boolean;
  peerMetricError: string | null;
  activePeerMetricKey: string;
  peerMetricMode: 'peers' | 'custom';
  cacheEntries: CacheEntry[];
  selectedMetricCompanyKeys: string[];
  activeTable: StatementTable | undefined;
}>();

const buyPointDraft = defineModel<string>('buyPointDraft', { required: true });
const activeStatement = defineModel<StatementType>('activeStatement', { required: true });

defineEmits<{
  selectCompany: [company: CompanySearchResult];
  openNote: [];
  startBuyPointEditing: [];
  saveBuyPoint: [];
  cancelBuyPointEditing: [];
  toggleYear: [year: string];
  changePeerMetric: [metric: string];
  changePeerMetricMode: [mode: 'peers' | 'custom'];
  changeMetricCompanies: [companies: string[]];
  refreshCompany: [];
  exportTable: [];
}>();
</script>

<template>
  <section class="content">
        <div v-if="favorites.length" class="favorite-strip" aria-label="收藏公司">
          <span>收藏</span>
          <button
            v-for="company in favorites"
            :key="companyKey(company)"
            :class="{ active: selectedCompany?.market === company.market && selectedCompany?.symbol === company.symbol }"
            type="button"
            @click="$emit('selectCompany', company)"
          >
            <i
              v-if="company.hasUnreadAnnouncements"
              class="favorite-unread-dot"
              :aria-label="`${company.unreadAnnouncementCount} 条新公告`"
            ></i>
            <Star :size="14" />
            <strong>{{ company.name }}</strong>
            <small>{{ company.displaySymbol }}</small>
          </button>
        </div>

        <div v-if="visibleRecentCompanies.length" class="favorite-strip recent-strip" aria-label="最近访问公司">
          <span>最近</span>
          <button
            v-for="company in visibleRecentCompanies"
            :key="companyKey(company)"
            type="button"
            @click="$emit('selectCompany', company)"
          >
            <Clock3 :size="14" />
            <strong>{{ company.name }}</strong>
            <small>{{ company.displaySymbol }}</small>
          </button>
        </div>

        <div class="company-card">
          <div class="company-title">
            <span class="market-badge">{{ marketLabel(selectedCompany?.market) }}</span>
            <div class="company-title-content">
              <div class="company-heading-row">
                <div class="company-name-block">
                  <div class="company-name-line">
                    <h1>{{ selectedCompany?.name ?? '选择公司' }}</h1>
                    <button
                      class="company-note-button"
                      :class="{ 'has-note': Boolean(activeCompanyInsight.note) }"
                      type="button"
                      :disabled="!selectedCompany"
                      aria-haspopup="dialog"
                      :aria-expanded="noteDialogOpen"
                      @click="$emit('openNote')"
                    >
                      <StickyNote :size="16" />
                      {{ activeCompanyInsight.note ? '修改备注' : '添加备注' }}
                    </button>
                  </div>
                  <p>{{ selectedCompany?.displaySymbol ?? '输入公司名或股票代码开始' }}</p>
                </div>
                <div class="company-note-preview" :class="{ empty: !activeCompanyInsight.note }">
                  <span>备注</span>
                  <p>{{ activeCompanyInsight.note || '暂无备注，点击“添加备注”记录你的看法。' }}</p>
                </div>
              </div>
              <div class="buy-point-field">
                <label :for="selectedCompany ? `buy-point-${selectedCompany.market}-${selectedCompany.symbol}` : 'buy-point'">
                  预估买点
                </label>
                <template v-if="buyPointEditing">
                  <input
                    :id="selectedCompany ? `buy-point-${selectedCompany.market}-${selectedCompany.symbol}` : 'buy-point'"
                    v-model="buyPointDraft"
                    type="text"
                    inputmode="decimal"
                    placeholder="例如：85–95 元"
                    :disabled="!selectedCompany"
                    aria-label="预估买点区间"
                    autofocus
                    @keydown.enter.prevent="$emit('saveBuyPoint')"
                    @keydown.esc.prevent="$emit('cancelBuyPointEditing')"
                  />
                  <button class="buy-point-save" type="button" @click="$emit('saveBuyPoint')">保存</button>
                  <button class="buy-point-cancel" type="button" @click="$emit('cancelBuyPointEditing')">取消</button>
                </template>
                <template v-else>
                  <strong class="buy-point-value" :class="{ empty: !activeCompanyInsight.buyPointRange }">
                    {{ activeCompanyInsight.buyPointRange || '暂未设置' }}
                  </strong>
                  <button
                    class="buy-point-edit"
                    type="button"
                    :disabled="!selectedCompany"
                    @click="$emit('startBuyPointEditing')"
                  >
                    {{ activeCompanyInsight.buyPointRange ? '修改' : '设置' }}
                  </button>
                </template>
                <span v-if="showBuyPointReminder" class="buy-point-reminder">
                  <AlertTriangle :size="14" />
                  请更新最新预估买点
                </span>
              </div>
            </div>
          </div>

          <div class="quote-grid">
            <div>
              <span>数据源</span>
              <strong>AKShare</strong>
            </div>
            <div>
              <span>报表范围</span>
              <strong>自上市年起</strong>
            </div>
            <div>
              <span>更新时间</span>
              <strong>{{ formatDate(statements?.fetchedAt) }}</strong>
            </div>
            <div>
              <span>单位</span>
              <strong>{{ statements?.unit ?? '-' }}</strong>
            </div>
          </div>
        </div>

        <div class="statement-cache-strip">
          <span>财报数据</span>
          <strong>{{ statementCacheLabel }}</strong>
          <small>缓存刷新：{{ formatDate(statements?.cache?.refreshedAt) }}</small>
        </div>

        <AnnouncementPanel
          :feed="announcementFeed"
          :loading="announcementLoading"
          :error="announcementError"
        />

        <div v-if="statementLoading" class="loading-panel company-loading-panel" role="status" aria-live="polite">
          <Loader2 class="spin-icon" :size="22" />
          <strong>正在读取 {{ selectedCompany?.name ?? '个股' }} 财报数据</strong>
          <span>本地没有缓存时会通过 AKShare 拉取，请稍候...</span>
        </div>

        <template v-else>
        <div v-if="statementError" class="status-banner">
          <AlertTriangle :size="18" />
          <span>{{ statementError }}</span>
        </div>

        <div class="year-strip" v-if="availableYears.length">
          <button
            v-for="year in availableYears"
            :key="year"
            :class="{ active: activeYears.includes(year) }"
            type="button"
            @click="$emit('toggleYear', year)"
          >
            {{ year }} 年报
          </button>
        </div>

        <div class="insight-grid">
          <MiniTrend :series="statements?.highlights ?? []" />
          <div class="metric-cards">
            <article v-for="card in summaryCards" :key="card.key" class="metric-card">
              <span>{{ card.label }}</span>
              <strong>{{ formatNumber(card.latest) }}</strong>
              <em :class="{ up: (card.delta ?? 0) >= 0, down: (card.delta ?? 0) < 0 }">
                <TrendingUp :size="15" />
                {{ card.delta === null ? '-' : `${card.delta.toFixed(2)}%` }}
              </em>
            </article>
          </div>
        </div>

        <PeerComparisonPanel
          :company="selectedCompany"
          :comparison="peerComparison"
          :loading="peerLoading"
          :error="peerError"
        />

        <PeerMetricChart
          :comparison="peerMetricComparison"
          :loading="peerMetricLoading"
          :error="peerMetricError"
          :metric-key="activePeerMetricKey"
          :mode="peerMetricMode"
          :cache-entries="cacheEntries"
          :selected-company-keys="selectedMetricCompanyKeys"
          @metric-change="$emit('changePeerMetric', $event)"
          @mode-change="$emit('changePeerMetricMode', $event)"
          @selection-change="$emit('changeMetricCompanies', $event)"
        />

        <CustomMetricChart :statements="statements" :active-years="activeYears" />

        <div class="toolbar">
          <div class="tabs">
            <button
              v-for="tab in [
                { type: 'balance', label: '资产负债表' },
                { type: 'income', label: '利润表' },
                { type: 'cashflow', label: '现金流量表' }
              ]"
              :key="tab.type"
              :class="{ active: activeStatement === tab.type }"
              type="button"
              @click="activeStatement = tab.type as StatementType"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="toolbar-actions">
            <button class="ghost-button blue" type="button" @click="$emit('refreshCompany')">
              <RefreshCw :size="16" />刷新
            </button>
            <button class="ghost-button blue" type="button" @click="$emit('exportTable')">
              <Download :size="16" />导出
            </button>
          </div>
        </div>

        <StatementTable :table="activeTable" :active-years="activeYears" />
        </template>
      </section>
</template>
