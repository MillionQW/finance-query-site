<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Check, CloudDownload, Database, X } from 'lucide-vue-next';
import type { PeerMetricComparison } from '../types/finance';
import { getStatements } from '../services/api';
import { peerCompanyKey } from '../finance/peer-preferences';
import {
  pullPeerStatements,
  type PeerStatementPullProgress,
  type PeerStatementPullResult
} from '../services/peer-statement-pull';

const PULL_BATCH_LIMIT = 5;

const props = defineProps<{
  missingCompanies: PeerMetricComparison['missingCompanies'];
}>();

const emit = defineEmits<{
  refreshed: [];
}>();

const expanded = ref(false);
const selectedKeys = ref<string[]>([]);
const running = ref(false);
const progress = ref<PeerStatementPullProgress | null>(null);
const result = ref<PeerStatementPullResult | null>(null);
let controller: AbortController | null = null;

const missingKey = computed(() => props.missingCompanies.map(peerCompanyKey).join(','));
const selectedCompanies = computed(() => {
  const selected = new Set(selectedKeys.value);
  return props.missingCompanies.filter((company) => selected.has(peerCompanyKey(company)));
});

watch(missingKey, () => {
  if (running.value) return;
  selectedKeys.value = props.missingCompanies.slice(0, PULL_BATCH_LIMIT).map(peerCompanyKey);
}, { immediate: true });

function toggleCompany(company: PeerMetricComparison['missingCompanies'][number]): void {
  if (running.value) return;
  const key = peerCompanyKey(company);
  if (selectedKeys.value.includes(key)) {
    selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
    return;
  }
  if (selectedKeys.value.length >= PULL_BATCH_LIMIT) return;
  selectedKeys.value = [...selectedKeys.value, key];
}

function selectBatch(): void {
  selectedKeys.value = props.missingCompanies.slice(0, PULL_BATCH_LIMIT).map(peerCompanyKey);
}

async function startPull(): Promise<void> {
  if (!selectedCompanies.value.length || running.value) return;
  const requestController = new AbortController();
  controller = requestController;
  running.value = true;
  result.value = null;
  progress.value = null;
  try {
    result.value = await pullPeerStatements({
      companies: selectedCompanies.value.slice(0, PULL_BATCH_LIMIT),
      signal: requestController.signal,
      pull: (company, signal) => getStatements(company.market, company.symbol, 0, true, signal),
      onProgress: (nextProgress) => {
        progress.value = nextProgress;
      }
    });
  } finally {
    if (controller === requestController) controller = null;
    running.value = false;
    progress.value = null;
    emit('refreshed');
  }
}

onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section class="peer-data-pull" aria-labelledby="peer-data-pull-title">
    <header>
      <div>
        <Database :size="17" />
        <span>
          <strong id="peer-data-pull-title">补齐缺失同行财报</strong>
          <small>手动拉取后写入 SQLite 缓存；每批最多 {{ PULL_BATCH_LIMIT }} 家，按顺序执行以降低数据源压力。</small>
        </span>
      </div>
      <button type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        <CloudDownload :size="15" />{{ expanded ? '收起' : '选择并拉取' }}
      </button>
    </header>

    <div v-if="expanded" class="peer-data-pull-body">
      <div class="peer-data-pull-tools">
        <span>已选 {{ selectedKeys.length }} / {{ PULL_BATCH_LIMIT }}</span>
        <button type="button" :disabled="running" @click="selectBatch">选择本批前 {{ PULL_BATCH_LIMIT }} 家</button>
      </div>
      <div class="peer-data-pull-list">
        <button
          v-for="missing in missingCompanies"
          :key="peerCompanyKey(missing)"
          :class="{ selected: selectedKeys.includes(peerCompanyKey(missing)) }"
          type="button"
          :aria-pressed="selectedKeys.includes(peerCompanyKey(missing))"
          :disabled="running || (!selectedKeys.includes(peerCompanyKey(missing)) && selectedKeys.length >= PULL_BATCH_LIMIT)"
          @click="toggleCompany(missing)"
        >
          <Check v-if="selectedKeys.includes(peerCompanyKey(missing))" :size="14" />
          <span><strong>{{ missing.name }}</strong><small>{{ missing.displaySymbol }}</small></span>
        </button>
      </div>

      <div v-if="running && progress" class="peer-data-pull-progress" role="status" aria-live="polite">
        <div>
          <strong>正在拉取 {{ progress.current.name }}</strong>
          <small>{{ Math.min(progress.completed + 1, progress.total) }} / {{ progress.total }}</small>
        </div>
        <progress :value="progress.completed" :max="progress.total"></progress>
        <button type="button" @click="controller?.abort()"><X :size="14" />取消</button>
      </div>

      <div v-if="result" :class="['peer-data-pull-result', { warning: result.failed.length }]" role="status">
        <strong>
          {{ result.cancelled ? '拉取已取消' : '本批处理完成' }}：成功缓存 {{ result.succeeded.length }} 家
          <template v-if="result.failed.length">，失败 {{ result.failed.length }} 家</template>
        </strong>
        <small v-if="result.failed.length">
          {{ result.failed.map((item) => `${item.company.name}：${item.message}`).join('；') }}
        </small>
      </div>

      <button
        v-if="!running"
        class="peer-data-pull-submit"
        type="button"
        :disabled="!selectedCompanies.length"
        @click="startPull"
      >
        <CloudDownload :size="16" />拉取并缓存 {{ selectedCompanies.length }} 家
      </button>
    </div>
  </section>
</template>
