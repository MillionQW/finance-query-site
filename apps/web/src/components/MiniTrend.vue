<script setup lang="ts">
import { computed } from 'vue';
import type { MetricSeries } from '../types/finance';

const props = defineProps<{
  series: MetricSeries[];
}>();

const width = 720;
const height = 160;
const padding = 18;
const colors = ['#2563eb', '#16a34a', '#f59e0b', '#0f766e', '#dc2626'];

const paths = computed(() => {
  return props.series.slice(0, 5).map((line, index) => {
    const values = line.points.map((point) => point.value).filter((value): value is number => value !== null);
    if (!values.length) {
      return { key: line.key, label: line.label, path: '', color: colors[index], last: null };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pointCount = Math.max(line.points.length - 1, 1);
    const commands = line.points
      .map((point, pointIndex) => {
        if (point.value === null) {
          return '';
        }
        const x = padding + (pointIndex / pointCount) * (width - padding * 2);
        const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
        return `${pointIndex === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
    return {
      key: line.key,
      label: line.label,
      path: commands,
      color: colors[index],
      last: values[values.length - 1]
    };
  });
});
</script>

<template>
  <section class="trend-panel">
    <div class="panel-title">
      <div>
        <p class="section-label">关键指标趋势</p>
        <h3>近 10 年概览</h3>
      </div>
      <div class="trend-legend">
        <span v-for="line in paths" :key="line.key">
          <i :style="{ backgroundColor: line.color }"></i>{{ line.label }}
        </span>
      </div>
    </div>

    <svg class="trend-chart" :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="关键财务指标趋势">
      <line
        v-for="tick in 4"
        :key="tick"
        x1="18"
        :y1="tick * 34"
        x2="702"
        :y2="tick * 34"
        stroke="#e5e7eb"
        stroke-width="1"
      />
      <path
        v-for="line in paths"
        :key="line.key"
        :d="line.path"
        fill="none"
        :stroke="line.color"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </section>
</template>
