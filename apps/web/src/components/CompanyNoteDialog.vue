<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  companyName?: string;
}>();
const note = defineModel<string>('note', { required: true });
defineEmits<{ close: []; save: [] }>();

const dialog = ref<HTMLElement | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null);

watch(() => props.open, (open) => {
  if (open) void nextTick(() => textarea.value?.focus());
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
          <span>公司备注</span>
          <h2 id="company-note-title">{{ companyName }}</h2>
        </div>
        <button type="button" aria-label="关闭备注弹窗" @click="$emit('close')">
          <X :size="20" />
        </button>
      </header>
      <label for="company-note-content">记录你的判断、风险点或后续关注事项</label>
      <textarea
        id="company-note-content"
        ref="textarea"
        v-model="note"
        rows="8"
        placeholder="例如：核心业务增长稳定，但需要继续观察毛利率和现金流……"
      ></textarea>
      <footer>
        <small>备注保存在本机 SQLite 数据库中</small>
        <div>
          <button class="note-dialog-cancel" type="button" @click="$emit('close')">取消</button>
          <button class="note-dialog-save" type="button" @click="$emit('save')">保存备注</button>
        </div>
      </footer>
    </section>
  </div>
</template>
