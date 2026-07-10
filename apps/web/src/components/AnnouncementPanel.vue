<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Bell, ExternalLink } from 'lucide-vue-next';
import type { AnnouncementCategory, AnnouncementFeed } from '../types/finance';

const props = defineProps<{
  feed: AnnouncementFeed | null;
  loading: boolean;
  error: string | null;
}>();

type CategoryFilter = '全部' | AnnouncementCategory;

const categories: CategoryFilter[] = ['全部', '年报', '业绩预告', '权益分派', '董事会', '风险提示', '其他'];
const activeCategory = ref<CategoryFilter>('全部');

const visibleItems = computed(() => {
  const items = props.feed?.items ?? [];
  const filtered = activeCategory.value === '全部'
    ? items
    : items.filter((item) => item.category === activeCategory.value);
  return filtered.slice(0, 20);
});

watch(
  () => props.feed ? `${props.feed.company.market}:${props.feed.company.symbol}` : '',
  () => {
    activeCategory.value = '全部';
  }
);

function categoryCount(category: CategoryFilter): number {
  const items = props.feed?.items ?? [];
  return category === '全部' ? items.length : items.filter((item) => item.category === category).length;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('zh-CN');
}
</script>

<template>
  <section class="announcement-panel">
    <div class="announcement-head">
      <div>
        <span><Bell :size="15" />最新公告</span>
        <h3>{{ feed?.company.name ?? '公司公告' }}</h3>
      </div>
      <small>每 12 小时更新 · {{ formatDate(feed?.refreshedAt) }}</small>
    </div>

    <div class="announcement-filters" aria-label="公告类别">
      <button
        v-for="category in categories"
        :key="category"
        :class="{ active: activeCategory === category }"
        type="button"
        @click="activeCategory = category"
      >
        {{ category }}
        <small>{{ categoryCount(category) }}</small>
      </button>
    </div>

    <div v-if="loading" class="peer-state">正在读取最新公告...</div>
    <div v-else-if="error" class="peer-state error">{{ error }}</div>
    <div v-else-if="!visibleItems.length" class="peer-state">
      当前类别暂无最近 60 天公告。
    </div>
    <div v-else class="announcement-list">
      <a
        v-for="item in visibleItems"
        :key="item.key"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="announcement-category">{{ item.category }}</span>
        <strong>{{ item.title }}</strong>
        <time :datetime="item.publishedAt">{{ formatDate(item.publishedAt) }}</time>
        <ExternalLink :size="15" />
      </a>
    </div>
  </section>
</template>
