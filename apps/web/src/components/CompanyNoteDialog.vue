<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import type { CompanyInsightDraft } from '../types/finance';

const props = defineProps<{
  open: boolean;
  companyName?: string;
}>();
const draft = defineModel<CompanyInsightDraft>({ required: true });
defineEmits<{ close: []; save: [] }>();

const dialog = ref<HTMLElement | null>(null);
const firstField = ref<HTMLTextAreaElement | null>(null);

watch(() => props.open, (open) => {
  if (open) void nextTick(() => firstField.value?.focus());
});

function trapFocus(event: KeyboardEvent): void {
  const focusable = dialog.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable?.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div
    v-if="open"
    class="note-dialog-backdrop"
    role="presentation"
    @mousedown.self="$emit('close')"
  >
    <section
      ref="dialog"
      class="note-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-note-title"
      @keydown.tab="trapFocus"
    >
      <header>
        <div>
          <span>研究档案</span>
          <h2 id="company-note-title">{{ companyName }}</h2>
        </div>
        <button type="button" aria-label="关闭备注弹窗" @click="$emit('close')">
          <X :size="20" />
        </button>
      </header>
      <div class="dossier-form">
        <label>
          <span>核心论点</span>
          <textarea
            ref="firstField"
            v-model="draft.thesis"
            rows="3"
            placeholder="为什么值得持续研究？核心竞争力和长期价值来自哪里？"
          ></textarea>
        </label>
        <label>
          <span>主要风险</span>
          <textarea
            v-model="draft.risks"
            rows="3"
            placeholder="哪些变化会削弱论点？需要关注哪些财务或经营风险？"
          ></textarea>
        </label>
        <label>
          <span>潜在催化剂</span>
          <textarea
            v-model="draft.catalysts"
            rows="3"
            placeholder="哪些事件可能推动盈利、估值或市场认知变化？"
          ></textarea>
        </label>
        <label>
          <span>待验证问题</span>
          <textarea
            v-model="draft.questions"
            rows="3"
            placeholder="下一份财报、公告或调研中需要验证什么？"
          ></textarea>
        </label>
        <label class="dossier-general-note">
          <span>自由备注</span>
          <textarea
            v-model="draft.note"
            rows="4"
            placeholder="补充记录估值假设、会议纪要或其他观察……"
          ></textarea>
        </label>
      </div>
      <footer>
        <small>研究档案保存在本机 SQLite 数据库中</small>
        <div>
          <button class="note-dialog-cancel" type="button" @click="$emit('close')">取消</button>
          <button class="note-dialog-save" type="button" @click="$emit('save')">保存档案</button>
        </div>
      </footer>
    </section>
  </div>
</template>
