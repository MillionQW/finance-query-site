<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronUp, GitBranch, WalletCards } from 'lucide-vue-next';
import type { FinancialStatements } from '../types/finance';
import {
  buildFinancialDriverAnalysis,
  type DriverValue
} from '../finance/financial-driver-analysis';
import { formatMetricValue } from '../finance/financial-metric-engine';

const props = defineProps<{ statements: FinancialStatements | null }>();
const expanded = ref(false);
const analysis = computed(() => buildFinancialDriverAnalysis(props.statements));

function formatValue(item: DriverValue, value: number | null): string {
  return formatMetricValue(value, item.kind);
}

function changeLabel(item: DriverValue): string {
  if (item.current === null || item.previous === null) return '上期不可比';
  const difference = item.current - item.previous;
  if (item.kind === 'amount') {
    return `${difference >= 0 ? '增加' : '减少'} ${formatMetricValue(Math.abs(difference), 'amount')}`;
  }
  if (item.kind === 'percent') {
    return `${difference >= 0 ? '上升' : '下降'} ${Math.abs(difference * 100).toFixed(2)} 个百分点`;
  }
  return `${difference >= 0 ? '上升' : '下降'} ${Math.abs(difference).toFixed(2)} 次`;
}
</script>

<template>
  <section class="driver-panel">
    <header>
      <div>
        <span>驱动拆解</span>
        <h3>利润、效率、杠杆与现金去向</h3>
      </div>
      <button
        type="button"
        :aria-expanded="expanded"
        aria-controls="financial-driver-content"
        @click="expanded = !expanded"
      >
        <ChevronUp v-if="expanded" :size="16" />
        <ChevronDown v-else :size="16" />
        {{ expanded ? '收起拆解' : '展开拆解' }}
      </button>
    </header>

    <div class="driver-overview">
      <div>
        <strong>{{ analysis.currentYear ?? '-' }}</strong>
        <span>当前年度</span>
      </div>
      <div>
        <strong>{{ analysis.previousYear ?? '-' }}</strong>
        <span>对比年度</span>
      </div>
      <div>
        <strong>{{ analysis.coverage }}%</strong>
        <span>拆解覆盖率</span>
      </div>
      <p>{{ analysis.caveat }}</p>
    </div>

    <div v-if="expanded" id="financial-driver-content" class="driver-content">
      <section>
        <div class="driver-section-title">
          <GitBranch :size="18" />
          <div>
            <h4>杜邦拆解</h4>
            <p>ROE 是由利润率、资产效率还是杠杆推动？</p>
          </div>
        </div>
        <div class="driver-card-grid">
          <article v-for="item in analysis.dupont" :key="item.label">
            <span>{{ item.label }}</span>
            <strong>{{ formatValue(item, item.current) }}</strong>
            <em>{{ changeLabel(item) }}</em>
            <p>{{ item.interpretation }}</p>
          </article>
        </div>
      </section>

      <section>
        <div class="driver-section-title">
          <WalletCards :size="18" />
          <div>
            <h4>利润到自由现金流</h4>
            <p>从账面利润追踪经营回款与资本投入。</p>
          </div>
        </div>
        <div class="driver-card-grid cash">
          <article v-for="item in analysis.cashBridge" :key="item.label">
            <span>{{ item.label }}</span>
            <strong>{{ formatValue(item, item.current) }}</strong>
            <em>{{ changeLabel(item) }}</em>
            <p>{{ item.interpretation }}</p>
          </article>
        </div>
      </section>

      <section>
        <div class="driver-section-title">
          <GitBranch :size="18" />
          <div>
            <h4>营运资本信号</h4>
            <p>把应收、存货和应付增速与收入增速放在同一基准上。</p>
          </div>
        </div>
        <div class="working-capital-grid">
          <article
            v-for="item in analysis.workingCapital"
            :key="item.label"
            :class="item.tone"
          >
            <span>{{ item.label }}</span>
            <strong>
              {{ item.growth === null ? '-' : `${(item.growth * 100).toFixed(2)}%` }}
            </strong>
            <p>{{ item.interpretation }}</p>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>
