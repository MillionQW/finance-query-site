<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { Loader2, RefreshCw } from 'lucide-vue-next';
import { formatDate, refreshRunLabel } from '../app/app-formatters';
import type { CacheEntry, StatementRefreshRuntimeStatus } from '../types/finance';

const CacheManagerPanel = defineAsyncComponent(() => import('./CacheManagerPanel.vue'));

defineProps<{
  refreshStatus: StatementRefreshRuntimeStatus | null;
  refreshTaskLoading: boolean;
  refreshTaskNotice: string | null;
  cacheEntries: CacheEntry[];
  cacheEntriesLoading: boolean;
  cacheEntriesError: string | null;
}>();

defineEmits<{ refresh: [] }>();
</script>

<template>
  <section class="settings-page">
    <header class="settings-page-head">
      <span>系统设置</span>
      <h1>数据与缓存</h1>
      <p>查看自动更新任务运行情况和本地 SQLite 缓存占用。</p>
    </header>

    <section class="refresh-task-panel">
      <div>
        <span>数据更新任务</span>
        <strong>
          {{ refreshStatus?.enabled ? `每 ${refreshStatus.intervalDays} 天自动检查` : '未启用' }}
        </strong>
      </div>
      <div>
        <span>待更新</span>
        <strong>{{ refreshStatus?.pendingTargets ?? 0 }}</strong>
      </div>
      <div>
        <span>上次运行</span>
        <strong>{{ refreshRunLabel(refreshStatus?.latestRun?.status) }}</strong>
        <small v-if="refreshStatus?.latestRun">
          {{ refreshStatus.latestRun.succeeded }}/{{ refreshStatus.latestRun.totalTargets }}
        </small>
      </div>
      <div>
        <span>下次检查</span>
        <strong>{{ formatDate(refreshStatus?.nextRunAt ?? undefined) }}</strong>
      </div>
      <button
        class="ghost-button blue"
        type="button"
        :disabled="refreshTaskLoading || refreshStatus?.running"
        @click="$emit('refresh')"
      >
        <Loader2 v-if="refreshTaskLoading || refreshStatus?.running" class="spin-icon" :size="16" />
        <RefreshCw v-else :size="16" />
        {{ refreshTaskLoading || refreshStatus?.running ? '更新中' : '立即更新' }}
      </button>
    </section>

    <div v-if="refreshTaskNotice" class="refresh-task-notice">
      {{ refreshTaskNotice }}
    </div>

    <CacheManagerPanel
      :entries="cacheEntries"
      :loading="cacheEntriesLoading"
      :error="cacheEntriesError"
    />
  </section>
</template>
