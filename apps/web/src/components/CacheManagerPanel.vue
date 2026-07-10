<script setup lang="ts">
import { computed } from 'vue';
import type { CacheEntry } from '../types/finance';

const props = defineProps<{
  entries: CacheEntry[];
  loading: boolean;
  error: string | null;
}>();

const stats = computed(() => {
  const statements = props.entries.filter((entry) => entry.kind === 'statements');
  const peers = props.entries.filter((entry) => entry.kind === 'peers');
  const bytes = props.entries.reduce((total, entry) => total + entry.payloadBytes, 0);
  return { statements: statements.length, peers: peers.length, bytes };
});

const cacheEntries = computed(() => props.entries);

function kindLabel(kind: CacheEntry['kind']): string {
  return kind === 'statements' ? '财报' : '同行';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
</script>

<template>
  <section class="cache-manager-panel">
    <div class="cache-manager-head">
      <div>
        <span>缓存管理</span>
        <h3>本地 SQLite 缓存</h3>
      </div>
      <strong>{{ formatBytes(stats.bytes) }}</strong>
    </div>

    <div class="cache-stat-grid">
      <article>
        <span>财报缓存</span>
        <strong>{{ stats.statements }}</strong>
      </article>
      <article>
        <span>同行缓存</span>
        <strong>{{ stats.peers }}</strong>
      </article>
      <article>
        <span>总大小</span>
        <strong>{{ formatBytes(stats.bytes) }}</strong>
      </article>
    </div>

    <div v-if="loading" class="peer-state">正在读取缓存列表...</div>
    <div v-else-if="error" class="peer-state error">{{ error }}</div>
    <div v-else-if="!cacheEntries.length" class="peer-state">暂无本地缓存。</div>
    <div v-else class="cache-entry-list">
      <div v-for="entry in cacheEntries" :key="`${entry.kind}-${entry.market}-${entry.symbol}-${entry.refreshedAt}`">
        <span>{{ kindLabel(entry.kind) }}</span>
        <strong>{{ entry.name ?? entry.displaySymbol }}</strong>
        <small>{{ entry.displaySymbol }} · {{ formatDate(entry.refreshedAt) }}</small>
        <em>{{ entry.years ? `${entry.years}年` : entry.peerCount ? `${entry.peerCount}家同行` : '-' }}</em>
      </div>
    </div>
  </section>
</template>
