<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { OperatingPeriod } from '../finance/operating-periods';
import { formatNumber } from '../app/app-formatters';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, LabelLayout, CanvasRenderer]);

const props = defineProps<{ rows: OperatingPeriod[]; view: 'growth' | 'margin' | 'cash' }>();
const metrics = {
  growth: [
    { name: '营收同比', value: 'revenueYoY', detail: 'revenue', color: '#326bb2' },
    { name: '归母净利润同比', value: 'profitYoY', detail: 'profit', color: '#008274' },
    { name: '扣非归母净利润同比', value: 'deductedYoY', detail: 'deductedProfit', color: '#97610f' }
  ],
  margin: [
    { name: '毛利率', value: 'grossMargin', detail: 'grossMarginChange', color: '#326bb2' },
    { name: '归母净利率', value: 'netMargin', detail: 'netMarginChange', color: '#008274' },
    { name: '期间费用率', value: 'expenseRatio', detail: 'expenseRatioChange', color: '#97610f' }
  ],
  cash: [
    { name: '经营现金流', value: 'cash', detail: 'cashYoY', color: '#326bb2' },
    { name: '归母净利润', value: 'profit', detail: 'profitYoY', color: '#008274' }
  ]
} as const;
const periodRows = computed(() => [...props.rows].reverse());
const activeMetrics = computed(() => metrics[props.view]);
const hasData = computed(() => periodRows.value.some(row => activeMetrics.value.some(metric => row[metric.value] !== null)));
const descriptions = {
  growth: '营收、归母净利润与扣非归母净利润同比',
  margin: '毛利率、归母净利率与期间费用率',
  cash: '经营现金流与归母净利润'
};
const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const element = ref<HTMLDivElement | null>(null);
const options = computed<EChartsCoreOption>(() => {
  const view = props.view;
  const isCash = view === 'cash';
  const rows = periodRows.value;
  const series = activeMetrics.value;
  return {
    color: series.map(metric => metric.color),
    grid: { left: 14, right: 16, top: 24, bottom: 64, outerBoundsMode: 'same' },
    legend: { type: 'scroll', bottom: 4, selected: view === 'growth' ? { '扣非归母净利润同比': false } : {} },
    xAxis: {
      type: 'category',
      data: rows.map(row => row.end.slice(0, 7)),
      axisLabel: { hideOverlap: true },
      axisLine: { onZero: false }
    },
    yAxis: { type: 'value', axisLabel: { formatter: isCash ? (value: number) => compactNumber.format(value) : percent } },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      confine: true,
      formatter: (points: { dataIndex: number; seriesIndex: number }[]) => {
        const row = rows[points[0]?.dataIndex];
        if (!row) return '';
        const lines = points.flatMap(point => {
          const metric = series[point.seriesIndex];
          const value = row[metric.value];
          if (value === null) return [];
          const detail = row[metric.detail];
          let label = `${metric.name}  ${isCash ? formatNumber(value) : percent(value)}`;
          if (detail !== null) {
            if (view === 'growth') label += `（当期 ${formatNumber(detail)}）`;
            else if (view === 'margin') label += `（同比 ${(detail * 100).toFixed(2)} 个百分点）`;
            else label += `（同比 ${percent(detail)}）`;
          }
          return [label];
        });
        return [row.label, ...lines].join('\n');
      }
    },
    series: series.map((metric, index) => ({
      name: metric.name,
      type: isCash ? 'bar' : 'line',
      data: rows.map(row => row[metric.value]),
      label: {
        show: true,
        position: isCash ? 'outside' : index === 1 ? 'bottom' : 'top',
        color: metric.color,
        fontSize: 11,
        formatter: ({ value }: { value: number | null }) => {
          if (value === null) return '';
          return isCash ? compactNumber.format(value) : percent(value);
        }
      },
      labelLayout: { hideOverlap: true },
      ...(isCash ? { barMaxWidth: 30 } : { connectNulls: false, symbolSize: 6 }),
      ...(view === 'growth' && index === 0 ? {
        markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#8191a5' }, data: [{ yAxis: 0 }] }
      } : {})
    }))
  };
});

watch(element, (node, _, onCleanup) => {
  if (!node) return;
  const chart = echarts.init(node);
  const stop = watch(options, option => chart.setOption(option, true), { immediate: true, flush: 'post' });
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(node);
  onCleanup(() => {
    stop();
    observer.disconnect();
    chart.dispose();
  });
}, { flush: 'post' });
</script>

<template>
  <div v-if="hasData" ref="element" class="operating-chart" role="img" :aria-label="descriptions[view]"></div>
  <p v-else class="operating-empty" role="status">该期间暂无可绘制的{{ view === 'growth' ? '同比' : view === 'margin' ? '利润率' : '现金流或利润' }}数据。</p>
</template>

<style scoped>
.operating-chart { width: 100%; height: 320px; }
.operating-empty { padding: 36px 12px; text-align: center; background: #f3f7fc; border-radius: 8px; }
@media (max-width: 600px) { .operating-chart { height: 280px; } }
</style>
