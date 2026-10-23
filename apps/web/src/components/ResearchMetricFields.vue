<script setup lang="ts">
import type { MetricIdentity } from '../types/research-tracking';
import { dimensions, standardMetrics } from '../finance/research-tracking';
defineProps<{ model: MetricIdentity; prefix: string }>();
</script>
<template>
  <div class="workbench-fields">
    <label>拆分维度<select v-model="model.dimension" @change="model.segment = model.dimension === '整体' ? '公司整体' : ''"><option v-for="d in dimensions" :key="d">{{ d }}</option></select></label>
    <label>业务／产品／地区名称<input v-model="model.segment" :readonly="model.dimension === '整体'" maxlength="100" placeholder="例如：高端产品、广告业务、海外" /></label>
    <label>经营指标<input v-model="model.metric" :list="`${prefix}-metrics`" maxlength="100" /><datalist :id="`${prefix}-metrics`"><option v-for="m in standardMetrics" :key="m" :value="m" /></datalist></label>
    <label>指标单位<input v-model="model.unit" :list="`${prefix}-units`" maxlength="30" /><datalist :id="`${prefix}-units`"><option v-for="u in ['亿元','万元','元','%','万人','万件','家','天','倍']" :key="u" :value="u" /></datalist></label>
    <label>报告币种<select v-model="model.currency"><option value="">不适用（非金额）</option><option>CNY</option><option>HKD</option><option>USD</option></select></label>
    <label>统计／利润口径<input v-model="model.basis" maxlength="200" placeholder="如：对外收入；分部调整后经营利润" /></label>
    <label>报告期起始<input v-model="model.periodStart" type="date" /></label>
    <label>报告期结束<input v-model="model.periodEnd" type="date" /></label>
  </div>
</template>
