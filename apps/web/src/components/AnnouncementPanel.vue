<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Bell, CircleAlert, ExternalLink } from 'lucide-vue-next';
import type {
  AnnouncementCategory,
  AnnouncementFeed,
  CompanyAnnouncement
} from '../types/finance';

const props = defineProps<{
  feed: AnnouncementFeed | null;
  loading: boolean;
  error: string | null;
}>();

type CategoryFilter = '重要' | AnnouncementCategory;

const categoryOrder: AnnouncementCategory[] = [
  '定期报告',
  '业绩预告',
  '风险事项',
  '融资债务',
  '股权变动',
  '并购投资',
  '关联交易',
  '经营事项',
  '分红回购',
  '治理人事',
  '例行披露',
  '其他',
  '年报',
  '权益分派',
  '董事会',
  '风险提示'
];
const activeCategory = ref<CategoryFilter>('重要');

const categories = computed<CategoryFilter[]>(() => {
  const present = new Set((props.feed?.items ?? []).map((item) => item.category));
  return ['重要', ...categoryOrder.filter((category) => present.has(category))];
});

const visibleItems = computed(() => {
  const items = props.feed?.items ?? [];
  const filtered = activeCategory.value === '重要'
    ? items.filter((item) => !isRoutineAnnouncement(item))
    : items.filter((item) => item.category === activeCategory.value);
  return [...filtered]
    .sort((left, right) => {
      const importance = importanceRank(right) - importanceRank(left);
      if (importance) return importance;
      return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    })
    .slice(0, 12);
});

watch(
  () => props.feed ? `${props.feed.company.market}:${props.feed.company.symbol}` : '',
  () => {
    activeCategory.value = '重要';
  }
);

function categoryCount(category: CategoryFilter): number {
  const items = props.feed?.items ?? [];
  return category === '重要'
    ? items.filter((item) => !isRoutineAnnouncement(item)).length
    : items.filter((item) => item.category === category).length;
}

function isRoutineAnnouncement(item: CompanyAnnouncement): boolean {
  return Boolean(
    item.isRoutine ||
    item.importance === 'routine' ||
    /翌日披露报表|月报表|证券变动月报表|通知信函|展示文件/.test(item.title)
  );
}

function importanceRank(item: CompanyAnnouncement): number {
  if (item.importance === 'high') return 3;
  if (item.importance === 'routine' || isRoutineAnnouncement(item)) return 1;
  return 2;
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
        {{ category === '重要' ? '重要事件' : category }}
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
        <span class="announcement-category" :class="item.importance">{{ item.category }}</span>
        <span class="announcement-title-block">
          <strong>{{ item.title }}</strong>
          <small v-if="item.impactHint">
            <CircleAlert :size="13" />
            {{ item.impactHint }}
          </small>
        </span>
        <time :datetime="item.publishedAt">{{ formatDate(item.publishedAt) }}</time>
        <ExternalLink :size="15" />
      </a>
    </div>
  </section>
</template>
