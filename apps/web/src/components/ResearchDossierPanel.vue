<script setup lang="ts">
import { computed } from 'vue';
import { BookOpenText, PencilLine } from 'lucide-vue-next';
import type { CompanyInsight } from '../types/finance';

const props = defineProps<{ insight: CompanyInsight }>();
defineEmits<{ edit: [] }>();

const sections = computed(() => [
  { key: 'thesis', label: '核心论点', value: props.insight.thesis, placeholder: '尚未形成核心论点' },
  { key: 'risks', label: '主要风险', value: props.insight.risks, placeholder: '尚未记录主要风险' },
  { key: 'catalysts', label: '潜在催化剂', value: props.insight.catalysts, placeholder: '尚未记录潜在催化剂' },
  { key: 'questions', label: '待验证问题', value: props.insight.questions, placeholder: '尚未列出待验证问题' }
]);

const completion = computed(() => (
  sections.value.filter((section) => Boolean(section.value?.trim())).length
));
</script>

<template>
  <section class="dossier-panel">
    <header>
      <div>
        <span>研究档案</span>
        <h3>把判断写成可验证的假设</h3>
      </div>
      <div class="dossier-actions">
        <small>{{ completion }} / 4 已填写</small>
        <button type="button" @click="$emit('edit')">
          <PencilLine :size="15" />
          编辑档案
        </button>
      </div>
    </header>

    <div class="dossier-grid">
      <article v-for="section in sections" :key="section.key" :class="{ empty: !section.value }">
        <BookOpenText :size="17" />
        <span>{{ section.label }}</span>
        <p>{{ section.value || section.placeholder }}</p>
      </article>
    </div>
  </section>
</template>
