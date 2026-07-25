<script setup lang="ts">
import { CheckCircle2, Database, History, ShieldCheck, TriangleAlert } from 'lucide-vue-next';
import { formatDate, formatNumber } from '../app/app-formatters';
import type {
  FinancialStatements,
  StatementQualityStatus,
  StatementRevisionChange
} from '../types/finance';

defineProps<{
  statements: FinancialStatements | null;
}>();

function statusLabel(status: StatementQualityStatus): string {
  if (status === 'pass') return '通过';
  if (status === 'warning') return '关注';
  if (status === 'fail') return '异常';
  return '未校验';
}

function statementLabel(type: StatementRevisionChange['statementType']): string {
  if (type === 'balance') return '资产负债表';
  if (type === 'income') return '利润表';
  return '现金流量表';
}

function formatChange(value: number | null): string {
  if (value === null) return '基数为 0';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
</script>

<template>
  <section v-if="statements?.quality" class="statement-trust-panel" :class="statements.quality.tone">
    <header>
      <div>
        <span><ShieldCheck :size="16" />数据可信度</span>
        <h2>{{ statements.quality.score }} 分</h2>
        <small>可校验项覆盖 {{ statements.quality.coveragePercent }}%</small>
      </div>
      <div class="statement-version-facts">
        <span><Database :size="15" />不可变版本</span>
        <strong>{{ statements.version?.count ?? 1 }} 个</strong>
        <small v-if="statements.version?.lastChangedAt">
          最近变化：{{ formatDate(statements.version.lastChangedAt) }}
        </small>
      </div>
    </header>

    <div class="statement-quality-checks">
      <article
        v-for="check in statements.quality.checks"
        :key="check.key"
        :class="check.status"
      >
        <CheckCircle2 v-if="check.status === 'pass'" :size="17" />
        <TriangleAlert v-else :size="17" />
        <div>
          <span>{{ check.label }} · {{ statusLabel(check.status) }}</span>
          <p>{{ check.detail }}</p>
        </div>
      </article>
    </div>

    <details v-if="statements.revision?.changedCount" class="statement-revision-details">
      <summary>
        <span><History :size="16" />检测到历史数据调整</span>
        <strong>
          {{ statements.revision.changedCount }} 项变化 /
          {{ statements.revision.materialChangeCount }} 项重大
        </strong>
      </summary>
      <div class="statement-revision-meta">
        比较 {{ formatDate(statements.revision.previousFetchedAt) }} 与
        {{ formatDate(statements.revision.currentFetchedAt) }} 两个数据版本
      </div>
      <div class="statement-revision-list">
        <article
          v-for="change in statements.revision.changes.slice(0, 8)"
          :key="`${change.scope}-${change.statementType}-${change.sourceItem}-${change.period}`"
          :class="{ material: change.material }"
        >
          <div>
            <strong>{{ change.item }}</strong>
            <span>{{ statementLabel(change.statementType) }} · {{ change.period }}</span>
          </div>
          <div>
            <span>{{ formatNumber(change.previousValue) }} → {{ formatNumber(change.currentValue) }}</span>
            <strong>{{ formatChange(change.changePercent) }}</strong>
          </div>
        </article>
      </div>
    </details>
  </section>
</template>
