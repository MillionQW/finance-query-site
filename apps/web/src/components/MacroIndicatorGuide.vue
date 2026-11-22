<script setup lang="ts">
import { computed } from 'vue';
import { macroGuide } from '../finance/macro-guide';

const props = defineProps<{ ids: string[]; nested?: boolean }>();
const guides = computed(() => props.ids.flatMap(id => macroGuide[id] ?? []));
</script>

<template>
  <div v-if="guides.length" class="macro-guides">
    <article v-for="guide in guides" :key="guide.title" class="macro-guide">
      <component :is="nested ? 'h4' : 'h3'" class="macro-guide-title">{{ guide.title }}怎么读</component>
      <dl>
        <div><dt>指标作用</dt><dd>{{ guide.purpose }}</dd></div>
        <div><dt>关键位置</dt><dd>{{ guide.levels }}</dd></div>
        <div><dt>投资时怎么看</dt><dd>{{ guide.implication }}</dd></div>
      </dl>
      <a :href="guide.reference" target="_blank" rel="noopener noreferrer">查看指标口径<span class="guide-sr-only">（{{ guide.title }}）</span></a>
    </article>
  </div>
</template>

<style scoped>
.macro-guides { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 12px; margin: 12px 0 0; }
.macro-guide { min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); }
.macro-guide-title { margin: 0 0 10px; font-size: 14px; }
.macro-guide dl { display: grid; gap: 7px; margin: 0 0 8px; }
.macro-guide dl > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 6px; }
.macro-guide dt, .macro-guide dd { margin: 0; font-size: 13px; line-height: 1.6; }
.macro-guide dt { font-weight: 650; }
.macro-guide dd { color: var(--muted); }
.macro-guide a { font-size: 12px; }
.guide-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 540px) { .macro-guide dl > div { grid-template-columns: 1fr; gap: 1px; } }
</style>
