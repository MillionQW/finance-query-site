<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, CheckCircle2, Compass, SearchCheck } from 'lucide-vue-next';
import { buildResearchSummary } from '../finance/research-summary';
import type { FinancialStatements } from '../types/finance';

const props = defineProps<{
  statements: FinancialStatements | null;
}>();

const summary = computed(() => buildResearchSummary(props.statements));
</script>

<template>
  <section class="research-summary-panel" :class="summary.tone">
    <header>
      <div>
        <span><Compass :size="16" />结论优先</span>
        <h2>{{ summary.status }}</h2>
        <p>{{ summary.headline }}</p>
      </div>
      <div class="research-summary-source">
        <SearchCheck :size="18" />
        <span>所有结论均来自下方具名指标与规则</span>
      </div>
    </header>

    <div v-if="summary.diagnostics.length" class="research-diagnostic-grid">
      <article
        v-for="diagnostic in summary.diagnostics"
        :key="diagnostic.key"
        :class="diagnostic.tone"
      >
        <div>
          <span>{{ diagnostic.eyebrow }}</span>
          <strong>{{ diagnostic.title }}</strong>
        </div>
        <em>{{ diagnostic.status }}</em>
        <p>{{ diagnostic.summary }}</p>
        <small>数据覆盖 {{ diagnostic.availableCount }}/{{ diagnostic.totalCount }}</small>
      </article>
    </div>

    <div class="research-priority-signals">
      <strong>优先关注</strong>
      <div v-if="summary.prioritySignals.length">
        <article
          v-for="signal in summary.prioritySignals"
          :key="`${signal.title}-${signal.message}`"
          :class="signal.tone"
        >
          <AlertTriangle :size="16" />
          <div>
            <span>{{ signal.title }}</span>
            <p>{{ signal.message }}</p>
          </div>
        </article>
      </div>
      <div v-else class="research-no-signal">
        <CheckCircle2 :size="16" />
        当前可计算指标暂未发现需要优先处理的风险信号。
      </div>
    </div>
  </section>
</template>
