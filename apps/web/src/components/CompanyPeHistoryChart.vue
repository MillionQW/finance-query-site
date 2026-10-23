<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GridComponent, TooltipComponent, AxisPointerComponent, MarkLineComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import type { CompanyValuation } from '../types/company-valuation';

echarts.use([GridComponent, TooltipComponent, AxisPointerComponent, MarkLineComponent, LineChart, CanvasRenderer]);
const props = defineProps<{ valuation: CompanyValuation; years: number }>();
const window = computed(() => props.valuation.windows.find(item => item.years === props.years));
const points = computed(() => (props.valuation.history ?? []).filter(point =>
  window.value && point.date >= window.value.startDate && point.date <= (props.valuation.dataDate ?? '')
));
const hasData = computed(() => points.value.some(point => point.pe !== null));
const levelColors = { 20: '#0f766e', 50: '#a16207', 80: '#9333ea' };
const referenceLevels = computed(() => window.value?.referenceLevels ?? []);
const referenceLines = computed(() => {
  // Equal quantiles share one line/label so constant histories remain readable.
  const groups = new Map<number, { labels: string[]; color: string }>();
  for (const level of referenceLevels.value) {
    if (level.pe === null || !Number.isFinite(level.pe)) continue;
    const group = groups.get(level.pe) ?? { labels: [], color: levelColors[level.percentile] };
    group.labels.push(`${level.percentile}%`);
    groups.set(level.pe, group);
  }
  return [...groups].map(([pe, group]) => ({
    name: group.labels.join(' / '), yAxis: pe,
    lineStyle: { color: group.color }, label: { color: group.color }
  }));
});
const el = ref<HTMLDivElement | null>(null);
let chart: ECharts | null = null;
let observer: ResizeObserver | null = null;

const option = computed<EChartsCoreOption>(() => ({
  animation: false,
  useUTC: true,
  grid: { left: 56, right: 24, top: 34, bottom: 38 },
  tooltip: {
    trigger: 'axis', confine: true,
    axisPointer: { type: 'line', lineStyle: { type: 'dashed', color: '#94a3b8' } },
    formatter: (params: unknown) => {
      const item = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number } | undefined;
      const point = typeof item?.dataIndex === 'number' ? points.value[item.dataIndex] : null;
      return point ? `${point.date}<br/>PE（TTM）：${point.pe === null ? '无有效数据' : `${point.pe.toFixed(2)} 倍`}` : '';
    }
  },
  xAxis: {
    type: 'time',
    min: window.value?.startDate ? Date.parse(window.value.startDate) : undefined,
    max: props.valuation.dataDate ? Date.parse(props.valuation.dataDate) : undefined,
    splitNumber: 4,
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    axisTick: { show: false },
    axisLabel: { color: '#64748b', fontSize: 11, hideOverlap: true, formatter: (value: number) => new Date(value).toISOString().slice(0, 7) },
    splitLine: { show: false }
  },
  yAxis: {
    type: 'value', name: 'PE（倍）', scale: true,
    nameTextStyle: { color: '#64748b', fontSize: 11 },
    axisLabel: { color: '#64748b', fontSize: 11, formatter: (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) },
    splitLine: { lineStyle: { color: '#e5ebf2', type: 'dashed' } }
  },
  series: [{
    name: 'PE（TTM）', type: 'line',
    data: points.value.map(point => [Date.parse(point.date), point.pe]),
    connectNulls: false, smooth: false, showSymbol: true, symbol: 'circle', symbolSize: 4,
    lineStyle: { width: 2, color: '#326bb2' }, itemStyle: { color: '#326bb2' },
    areaStyle: { color: 'rgba(50,107,178,0.06)' },
    markLine: {
      silent: true, symbol: ['none', 'none'],
      lineStyle: { type: 'dashed', width: 1.5 },
      label: { show: true, position: 'insideEndTop', formatter: '{b}', fontSize: 11 },
      data: referenceLines.value
    }
  }]
}));

function render() {
  if (!el.value || !hasData.value) return;
  chart ??= echarts.init(el.value);
  chart.setOption(option.value, true);
  chart.resize();
}
watch(option, render, { flush: 'post' });
onMounted(() => {
  render();
  observer = new ResizeObserver(() => chart?.resize());
  if (el.value) observer.observe(el.value);
});
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); chart = null; });
</script>

<template>
  <section class="pe-history" aria-label="PE（TTM）历史走势图">
    <div class="pe-history-heading">
      <h3>近 {{ years }} 年 PE（TTM）走势</h3>
      <p aria-live="polite">历史分位 <strong>{{ window?.percentile?.toFixed(2) ?? '—' }}{{ window?.percentile === null ? '' : '%' }}</strong><span>有效样本 {{ window?.sampleCount ?? 0 }} 条</span></p>
    </div>
    <div class="pe-reference-levels" aria-label="PE 分位参考线" aria-live="polite">
      <span v-for="level in referenceLevels" :key="level.percentile" :style="{ color: levelColors[level.percentile] }">
        <i aria-hidden="true"></i>{{ level.percentile }}% 分位 <strong>{{ level.pe === null ? '—' : `${level.pe.toFixed(2)} 倍` }}</strong>
      </span>
    </div>
    <div v-show="hasData" ref="el" class="pe-history-canvas" role="img" :aria-label="`近 ${years} 年 PE（TTM）历史走势，${window?.sampleCount ?? 0} 条有效样本`"></div>
    <p v-if="!hasData" class="pe-history-empty">该区间暂无有效 PE（TTM）数据</p>
    <p class="pe-history-note">横轴为日期，纵轴为 PE 倍数。曲线连接历史抽样记录，缺失或非正 PE 处断开；分位值按整个所选区间计算。</p>
    <p class="pe-history-note">参考线按所选区间有效 PE 样本排序后线性插值计算（50% 为中位数）；样本不足 2 条时不显示参考线。</p>
  </section>
</template>

<style scoped>
.pe-history { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 20px; min-width: 0; }
.pe-history-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
h3 { font-size: 15px; margin: 0; color: var(--text); }
.pe-history-heading p { margin: 0; color: var(--muted); font-size: 12px; }
.pe-history-heading strong { color: #326bb2; font-size: 18px; margin-left: 6px; }
.pe-history-heading span { margin-left: 16px; white-space: nowrap; }
.pe-history-canvas { width: 100%; height: 300px; margin-top: 14px; }
.pe-reference-levels { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-top: 14px; font-size: 12px; }
.pe-reference-levels span { display: inline-flex; align-items: center; gap: 6px; }
.pe-reference-levels i { width: 18px; border-top: 2px dashed currentColor; }
.pe-history-note, .pe-history-empty { color: var(--muted); font-size: 12px; line-height: 1.7; }
.pe-history-empty { text-align: center; padding: 60px 12px; }
.pe-history-note { margin: 4px 0 0; }
@media (max-width: 700px) { .pe-history-canvas { height: 260px; } }
</style>
