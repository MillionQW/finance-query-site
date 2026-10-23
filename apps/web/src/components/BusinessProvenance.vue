<script setup lang="ts">
import type { BusinessOrigin } from '../types/research-tracking';
defineProps<{origin:BusinessOrigin}>();
</script>
<template>
  <details class="tracking-provenance">
    <summary>{{origin.missing?'源中缺失 · 待核对':origin.managed?'自动抓取':'人工修订 · 已保护'}} · 原始证据</summary>
    <p>抓取时间：{{new Date(origin.fetchedAt).toLocaleString('zh-CN')}}<br />原始字段：{{origin.rawField}}<br />原始值：{{origin.rawValue}} {{origin.rawUnit}}</p>
    <p v-if="!origin.managed">手工修订后自动刷新不覆盖此记录；原始值保留用于核对。</p>
    <p v-if="origin.missing">最近非空源结果中缺少该记录，暂不参与同比及假设验证。</p>
    <pre>{{JSON.stringify(origin.rawRecord,null,2)}}</pre>
  </details>
</template>
