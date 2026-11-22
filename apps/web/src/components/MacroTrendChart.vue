<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { AxisPointerComponent, GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { macroPeriod, macroValue } from '../finance/macro-format';
import type { MacroTrendSeries } from '../types/macro';

echarts.use([AxisPointerComponent, GridComponent, MarkLineComponent, TooltipComponent, LineChart, CanvasRenderer]);

const props = defineProps<{
  series: MacroTrendSeries[];
  title: string;
  domain?: [number, number];
  compact?: boolean;
}>();
const canvas = ref<HTMLDivElement | null>(null);
let chart: ECharts | undefined;
let observer: ResizeObserver | undefined;
const colors = ['#205db2', '#b15b16'];
const axisNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

const option = computed<EChartsCoreOption>(() => {
  const { benchmark, unit, frequency } = props.series[0].indicator;
  const visible = props.series;
  return {
    animation: false,
    useUTC: true,
    grid: { left: props.domain ? 64 : 12, right: 18, top: 33, bottom: props.domain ? 27 : 8, containLabel: !props.domain },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      axisPointer: { type: 'line', lineStyle: { type: 'dashed', color: '#8da4bd' } },
      formatter(params: unknown) {
        const hits = (Array.isArray(params) ? params : [params]) as { seriesIndex: number; dataIndex: number }[];
        return hits.flatMap(({ seriesIndex, dataIndex }) => {
          const item = visible[seriesIndex];
          const point = item?.points[dataIndex];
          return point ? [
            `${item.indicator.shortName}　${macroPeriod(point)}　${macroValue(point.value, item.indicator)}\n` +
            `发布日期 ${point.releasedOn ?? '未核实'} · ${point.source}`
          ] : [];
        }).join('\n\n');
      }
    },
    xAxis: {
      type: 'time', splitNumber: 5,
      min: props.domain?.[0], max: props.domain?.[1],
      axisLine: { lineStyle: { color: '#d1dcea' } },
      axisTick: { show: false },
      axisLabel: {
        hideOverlap: true, color: '#536781',
        formatter: (value: number) => new Date(value).toISOString().slice(0, frequency === 'monthly' ? 7 : 10)
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value', scale: true, name: unit,
      ...(benchmark === null ? {} : {
        min: ({ min, max }: { min: number; max: number }) => min > benchmark ? benchmark - (max - benchmark) * 0.1 : undefined,
        max: ({ min, max }: { min: number; max: number }) => max < benchmark ? benchmark + (benchmark - min) * 0.1 : undefined
      }),
      nameTextStyle: { color: '#536781' },
      axisLabel: { color: '#536781', formatter: (value: number) => axisNumber.format(value) },
      splitLine: { lineStyle: { color: '#e6edf5' } }
    },
    series: visible.map(({ indicator, points }, index) => ({
      name: indicator.shortName,
      type: 'line',
      data: points.map(point => [Date.parse(point.period), point.value]),
      showSymbol: (frequency === 'monthly' && points.length <= 36) || points.length === 1,
      symbol: index === 0 ? 'circle' : 'diamond',
      symbolSize: 5,
      lineStyle: { color: colors[index], width: 2, type: index === 0 ? 'solid' : 'dashed' },
      itemStyle: { color: colors[index] },
      areaStyle: props.series.length === 1 && benchmark === null ? { color: 'rgba(32, 93, 178, 0.08)' } : undefined,
      markLine: benchmark === null || index !== 0 ? undefined : {
        symbol: 'none', silent: true,
        label: { show: true, position: 'insideEndTop', color: '#596d84' },
        lineStyle: { color: '#8194ac', type: 'dashed' },
        data: [{ name: String(benchmark), yAxis: benchmark, label: { formatter: '{b}' } }]
      }
    }))
  };
});

function draw() {
  if (!canvas.value) return;
  chart ??= echarts.init(canvas.value);
  chart.setOption(option.value, true);
}

watch(option, draw, { flush: 'post' });
onMounted(() => {
  if (!canvas.value) return;
  draw();
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(canvas.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div>
    <div v-if="series.length > 1" class="macro-chart-legend" aria-label="图例">
      <span v-for="(item, index) in series" :key="item.indicator.id">
        <i :style="{ borderColor: colors[index] }" aria-hidden="true"></i>
        {{ item.indicator.shortName }}
      </span>
    </div>
    <div
      ref="canvas"
      class="macro-chart-canvas"
      :class="{ 'macro-chart-compact': compact }"
      role="img"
      :aria-label="`${title}历史走势图。具体数值见下方明细表。`"
    ></div>
  </div>
</template>

<style scoped>
.macro-chart-canvas { height: clamp(250px, 38vw, 350px); width: 100%; }
.macro-chart-compact { height: clamp(200px, 27vw, 255px); }
.macro-chart-legend { display: flex; flex-wrap: wrap; gap: 7px 20px; padding: 12px 2px 0; color: var(--muted); font-size: 13px; }
.macro-chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
.macro-chart-legend i { display: inline-block; width: 18px; border-top: 2px solid; }
.macro-chart-legend span + span i { border-top-style: dashed; }
</style>
