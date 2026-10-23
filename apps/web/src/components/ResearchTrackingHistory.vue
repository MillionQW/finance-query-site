<script setup lang="ts">
import type { BusinessData,HypothesisData,ResearchEntry } from '../types/research-tracking';
import { researchNumber as num } from '../finance/research-tracking';
import BusinessProvenance from './BusinessProvenance.vue';
defineProps<{ entries:ResearchEntry<BusinessData|HypothesisData>[]; title:string }>();
defineEmits<{close:[]}>();
</script>
<template>
  <section class="research-workbench" aria-label="研究记录历史">
    <header><h2>{{title}} · 历史版本</h2><button type="button" @click="$emit('close')">收起历史</button></header>
    <article v-for="entry in entries" :key="entry.version" class="tracking-history-entry">
      <strong>版本 {{entry.version}} · {{new Date(entry.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}}（北京时间）{{entry.data.archived?' · 已归档':''}}</strong>
      <p>{{entry.data.dimension}} / {{entry.data.segment}} / {{entry.data.metric}} · {{entry.data.periodStart}} — {{entry.data.periodEnd}} · {{entry.data.basis}}</p>
      <template v-if="'value' in entry.data"><p>{{num(entry.data.value)}} {{entry.data.unit}} {{entry.data.currency}} · {{entry.data.sourceText}} · {{entry.data.page}}</p><a v-if="entry.data.sourceUrl" :href="entry.data.sourceUrl" target="_blank" rel="noopener noreferrer">查看原始来源</a><p>{{entry.data.note}}</p><BusinessProvenance v-if="entry.data.origin" :origin="entry.data.origin" /></template>
      <template v-else><p>{{entry.data.thesis}}</p><p>预期 {{entry.data.expectedMin===null?'不设下限':num(entry.data.expectedMin)}} 至 {{entry.data.expectedMax===null?'不设上限':num(entry.data.expectedMax)}} {{entry.data.unit}} {{entry.data.currency}} · 验证日期 {{entry.data.dueDate}}</p><p>依据：{{entry.data.rationale}}</p><p v-if="entry.data.review">实际 {{num(entry.data.review.actual)}} · {{entry.data.review.outcome==='met'?'指标达标':'指标偏离'}} · 数据版本 {{entry.data.review.businessVersion}}<br />结论：{{entry.data.review.note}}<br />估值影响：{{entry.data.review.valuationImpact}}</p></template>
    </article>
  </section>
</template>
