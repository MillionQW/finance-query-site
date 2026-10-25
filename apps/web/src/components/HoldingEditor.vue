<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Holding, HoldingInput } from '../types/portfolio';
import { portfolioDate, shanghaiYear, valuationExpired } from '../finance/portfolio';
import { saveHolding } from '../services/portfolio';

const props = defineProps<{ holding: Holding }>();
const emit = defineEmits<{ close: []; saved: [holding: Holding] }>();
const dialog = ref<HTMLDialogElement>();
const form = ref<HoldingInput>({ market: props.holding.market, symbol: props.holding.symbol, name: props.holding.name,
  holdingValue: props.holding.holdingValue, holdingCurrency: props.holding.holdingCurrency ?? 'CNY', valuation: props.holding.valuation, buyPoint: props.holding.buyPoint,
  buyPointUpper: props.holding.buyPointUpper ?? props.holding.buyPoint,
  sellPoint: props.holding.sellPoint, note: props.holding.note, expectedVersion: props.holding.version, confirmValuation: false });
const valueText = ref(props.holding.holdingValue == null ? '' : String(props.holding.holdingValue));
const saving = ref(false);
const error = ref('');
const expired = computed(() => valuationExpired(props.holding.valuation, props.holding.valuationUpdatedAt));
async function save() {
  saving.value = true; error.value = '';
  try {
    for (const field of ['buyPoint', 'buyPointUpper', 'sellPoint'] as const) {
      const value = String(form.value[field]).trim();
      if (value && (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) throw new Error('理想买点和1年内卖点只能填写非负数字（可含小数），请将历史文字或区间改为数字');
      form.value[field] = value;
    }
    if (Boolean(form.value.buyPoint) !== Boolean(form.value.buyPointUpper)) throw new Error('理想买点的下限和上限须同时填写，或同时留空');
    if (form.value.buyPoint && Number(form.value.buyPoint) > Number(form.value.buyPointUpper)) throw new Error('理想买点下限不能大于上限');
    form.value.holdingValue = String(valueText.value).trim() === '' ? null : Number(valueText.value);
    if (form.value.holdingValue !== null && (!Number.isFinite(form.value.holdingValue) || form.value.holdingValue < 0 || form.value.holdingValue > 1e12)) throw new Error('持仓总市值应为0到1万亿之间的金额');
    emit('saved', await saveHolding(props.holding.id, form.value));
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
onMounted(() => dialog.value?.showModal());
onUnmounted(() => dialog.value?.close());
</script>

<template>
  <dialog ref="dialog" class="holding-dialog" aria-labelledby="holding-editor-title" @cancel.prevent="!saving && emit('close')">
    <form @submit.prevent="save">
      <div class="holding-dialog-head"><div><span class="portfolio-eyebrow">编辑持仓与判断</span><h2 id="holding-editor-title">{{ holding.name }} <small>{{ holding.symbol }}</small></h2></div>
        <button type="button" :disabled="saving" aria-label="关闭编辑" @click="emit('close')">×</button></div>
      <p>估值、买点和卖点均按公司总市值填写，单位：亿元人民币。理想买点填写下限和上限两个数字，表格会显示对应的每股价格区间。</p>
      <div class="holding-form-grid">
        <label>当前持仓总市值（元）<input v-model="valueText" type="number" min="0" max="1000000000000" step="any" placeholder="例如：100000；无持仓填0" /></label>
        <label>持仓金额币种<select v-model="form.holdingCurrency" aria-label="持仓金额币种"><option value="CNY">人民币（CNY）</option><option value="HKD">港币（HKD）</option></select></label>
      </div>
      <p class="holding-help">填写你当前持有这家公司股票的总金额。港币金额按页面汇率折合人民币，持股比例自动计算。</p>
      <label>三年后估值（亿元人民币）<input v-model="form.valuation" maxlength="150" placeholder="例如：60000 ±10%" /></label>
      <div :class="{ 'portfolio-expired-text': expired }" class="holding-valuation-status">
        上次填写：{{ portfolioDate(holding.valuationUpdatedAt) }}<span v-if="expired"> · 过期数据，需要更新</span>
      </div>
      <label class="holding-confirm"><input v-model="form.confirmValuation" type="checkbox" :disabled="!form.valuation.trim()" />
        我已重新评估，确认此估值适用于{{ shanghaiYear() + 3 }}年（即使数值未变）</label>
      <p class="holding-help">修改估值或勾选确认后保存，会记录本次时间。仅修改仓位、买卖点或备注，不更新估值时间。</p>
      <div class="holding-form-grid">
        <label>理想买点下限（亿元人民币）<input v-model="form.buyPoint" type="number" min="0" step="any" placeholder="例如：30000" /></label>
        <label>理想买点上限（亿元人民币）<input v-model="form.buyPointUpper" type="number" min="0" step="any" placeholder="例如：35000" /></label>
      </div>
      <label>1年内卖点（亿元人民币）<input v-model="form.sellPoint" type="number" min="0" step="any" placeholder="例如：78000" /></label>
      <p v-if="[holding.buyPoint, holding.sellPoint].some(v => v && !/^\d+(\.\d+)?$/.test(v))" class="holding-help portfolio-expired-text">历史填写：买点 {{ holding.buyPoint || '未填' }}，卖点 {{ holding.sellPoint || '未填' }}。请将文字或区间改为数字后保存。</p>
      <label>备注<textarea v-model="form.note" rows="3" maxlength="2000" placeholder="估值依据或待观察事项" /></label>
      <p v-if="error" role="alert" class="portfolio-error">{{ error }}</p>
      <div class="holding-dialog-actions"><button type="button" :disabled="saving" @click="emit('close')">取消</button>
        <button class="portfolio-primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存修改' }}</button></div>
    </form>
  </dialog>
</template>
