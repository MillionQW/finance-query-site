<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { savePerformance } from '../services/performance';
import type { PerformanceEntry, PerformanceInput, PerformanceState } from '../types/performance';

const props = defineProps<{ state: PerformanceState; entry: PerformanceEntry | null; kind: PerformanceInput['kind'] }>();
const emit = defineEmits<{ close: []; saved: [state: PerformanceState] }>();
const dialog = ref<HTMLDialogElement>();
const localNow = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16);
const at = ref(props.entry?.at ?? (props.kind === 'initial' ? `${props.state.startDate}T${localNow().slice(11)}` : localNow()));
const amount = ref<string | number>(props.entry?.amount ?? '');
const currency = ref<'CNY' | 'HKD'>(props.entry?.currency ?? 'CNY');
const fx = ref<string | number>(props.entry?.currency === 'HKD' ? props.entry.fx : '');
const before = ref<string | number>(props.entry?.beforeValue ?? '');
const note = ref(props.entry?.note ?? '');
const saving = ref(false), error = ref('');
const flow = computed(() => props.kind === 'deposit' || props.kind === 'withdrawal');
const labels = { initial: '设置起始资产', snapshot: '添加资产快照', deposit: '记录转入资金', withdrawal: '记录取出资金' };
async function save() {
  saving.value = true; error.value = '';
  try {
    if (String(amount.value).trim() === '') throw new Error('请填写金额');
    if (currency.value === 'HKD' && String(fx.value).trim() === '') throw new Error('请填写该笔流水当日的汇率');
    emit('saved', await savePerformance(props.entry?.id ?? null, { kind: props.kind, at: at.value, amount: Number(amount.value),
      currency: flow.value ? currency.value : 'CNY', fx: flow.value && currency.value === 'HKD' ? Number(fx.value) : 1,
      beforeValue: flow.value && String(before.value).trim() !== '' ? Number(before.value) : null, note: note.value }, props.state.version));
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
onMounted(() => dialog.value?.showModal());
onUnmounted(() => dialog.value?.close());
</script>

<template>
  <dialog ref="dialog" class="holding-dialog" aria-labelledby="performance-editor-title" @cancel.prevent="!saving && emit('close')">
    <form @submit.prevent="save">
      <div class="holding-dialog-head"><h2 id="performance-editor-title">{{ entry ? '编辑收益记录' : labels[kind] }}</h2><button type="button" :disabled="saving" aria-label="关闭收益录入" @click="emit('close')">×</button></div>
      <p v-if="kind === 'initial'">从 {{ state.startDate }} 开始记录。填写起始时刻的全部账户净资产，初始基金净值设为1。</p>
      <p v-else-if="flow">仅记录跨越统计账户范围的转入或取出。账户内买卖、换汇、分红到账以及统计范围内账户互转不算出入金。</p>
      <p v-else>填写该时刻的账户净资产：全部持仓市值＋现金－相关负债，统一折合人民币。请确认此前出入金已全部录入。</p>
      <label>记录时间（北京时间）<input v-model="at" type="datetime-local" required :min="`${state.startDate}T00:00`" :max="localNow()" /></label>
      <p class="holding-help">同日多笔按时间排序；相同时刻请编辑原记录，或用不同分钟明确先后。XIRR按日期计算。</p>
      <label>{{ flow ? '出入金金额（原币元）' : '账户净资产（人民币元）' }}<input v-model="amount" type="number" required min="0" max="1000000000000" step="any" placeholder="请输入实际金额" /></label>
      <template v-if="flow">
        <label>流水币种<select v-model="currency" aria-label="流水币种"><option value="CNY">人民币</option><option value="HKD">港币</option></select></label>
        <label v-if="currency === 'HKD'">当日汇率（1港币兑人民币）<input v-model="fx" type="number" required min="0.00000001" max="100" step="any" placeholder="填当日实际或采用的参考汇率" /></label>
        <p v-if="currency === 'HKD'" class="holding-help">汇率随这笔记录保存，以后刷新行情不会改变历史折算金额。</p>
        <label>转账前账户净资产（人民币元）<input v-model="before" type="number" min="0" max="1000000000000" step="any" placeholder="用于计算基金净值，可暂留空补录" /></label>
        <p class="holding-help">必须是此次转账发生之前的账户净资产。缺失时基金净值法暂停计算；有截止日资产快照时仍可计算XIRR。</p>
      </template>
      <label>记录备注<textarea v-model="note" maxlength="1000" rows="2" placeholder="如：券商账户净资产截图、汇率来源" /></label>
      <p v-if="error" role="alert" class="portfolio-error">{{ error }}</p>
      <div class="holding-dialog-actions"><button type="button" :disabled="saving" @click="emit('close')">取消</button><button type="submit" class="portfolio-primary" :disabled="saving">{{ saving ? '保存中…' : '保存收益记录' }}</button></div>
    </form>
  </dialog>
</template>
