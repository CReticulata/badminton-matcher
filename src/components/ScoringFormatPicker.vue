<script setup lang="ts">
import { nextTick, onMounted, ref, useId } from 'vue'
import {
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
  displayScoringFormat,
  type ScoringFormatSnapshot,
} from '../lib/scoring-format'

const props = withDefaults(defineProps<{ modelValue?: ScoringFormatSnapshot | null; blocking?: boolean; title?: string }>(), { modelValue: null, blocking: false, title: '選擇計分賽制' })
const emit = defineEmits<{ save: [snapshot: ScoringFormatSnapshot]; cancel: [] }>()
const trigger = ref<HTMLButtonElement | null>(null)
const firstControl = ref<HTMLButtonElement | null>(null)
const draft = ref<HTMLElement | null>(null)
const mode = ref<'catalog' | 'custom' | 'unknown'>('catalog')
const chosenCatalog = ref<'badminton-21-w2-c30' | 'badminton-15-w2-c21' | null>(null)
const label = ref('')
const target = ref('21')
const winBy = ref('2')
const cap = ref('30')
const errors = ref<Record<string, string>>({})
const invalid = ref(false)
const editing = ref(props.blocking || !props.modelValue)
const errorId = useId()

function begin(): void {
  editing.value = true
  errors.value = {}
  invalid.value = false
  if (props.modelValue?.kind === 'catalog') { mode.value = 'catalog'; chosenCatalog.value = props.modelValue.formatId }
  else if (props.modelValue?.kind === 'custom') { mode.value = 'custom'; label.value = props.modelValue.label; target.value = String(props.modelValue.rules.target); winBy.value = String(props.modelValue.rules.winBy); cap.value = String(props.modelValue.rules.cap) }
  else { mode.value = 'unknown'; chosenCatalog.value = null }
  nextTick(() => firstControl.value?.focus())
}
function chooseCatalog(id: 'badminton-21-w2-c30' | 'badminton-15-w2-c21'): void { mode.value = 'catalog'; chosenCatalog.value = id }
function save(): void {
  errors.value = {}; invalid.value = false
  try {
    let result: ScoringFormatSnapshot
    if (mode.value === 'catalog') {
      if (!chosenCatalog.value) throw new Error('請明確選擇一種目錄賽制')
      result = createCatalogSnapshot(chosenCatalog.value)
    } else if (mode.value === 'unknown') result = createUnknownSnapshot('explicit-unknown')
    else {
      const rules = { target: Number(target.value), winBy: Number(winBy.value), cap: Number(cap.value) }
      if (!label.value.trim()) errors.value.label = '請輸入自訂名稱'
      if (!Number.isSafeInteger(rules.target) || rules.target < 1) errors.value.target = '目標分數必須是正整數'
      if (!Number.isSafeInteger(rules.winBy) || rules.winBy < 1 || rules.winBy > rules.target) errors.value.winBy = '勝分差必須介於 1 和目標分數之間'
      if (!Number.isSafeInteger(rules.cap) || rules.cap < 1 || rules.cap < rules.target) errors.value.cap = '上限必須是不得小於目標分數的正整數'
      if (Object.keys(errors.value).length) throw new Error('請修正計分賽制欄位')
      result = createCustomSnapshot(label.value, rules)
    }
    editing.value = false
    emit('save', result)
  } catch (error) {
    invalid.value = true
    if (!Object.keys(errors.value).length) errors.value.choice = error instanceof Error ? error.message : '請選擇計分賽制'
    nextTick(() => {
      const firstInvalid = draft.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (firstInvalid) firstInvalid.focus()
      else firstControl.value?.focus()
    })
  }
}
function cancel(): void { editing.value = false; emit('cancel'); if (!props.blocking) nextTick(() => trigger.value?.focus()) }
function onKeydown(event: KeyboardEvent): void { if (event.key === 'Escape' && !props.blocking) { event.preventDefault(); cancel() } }
onMounted(() => { if (props.blocking) begin() })
defineExpose({ begin, display: () => props.modelValue ? displayScoringFormat(props.modelValue) : '' })
</script>

<template>
  <section class="format-picker" @keydown="onKeydown">
    <button v-if="!blocking" ref="trigger" type="button" class="format-trigger" @click="begin">{{ modelValue ? displayScoringFormat(modelValue) : '選擇計分賽制' }}</button>
    <div v-if="blocking || editing" ref="draft" class="format-draft" role="group" :aria-labelledby="`${title}-heading`">
      <h3 :id="`${title}-heading`" tabindex="-1" class="font-semibold">{{ title }}</h3>
      <p v-if="invalid" class="text-sm text-red-700" aria-live="assertive">請修正下列欄位</p>
      <p v-if="errors.choice" class="text-sm text-red-700" aria-live="assertive">{{ errors.choice }}</p>
      <div class="grid gap-2 sm:grid-cols-3">
        <button ref="firstControl" type="button" data-testid="format-catalog-21" class="format-choice" :aria-pressed="mode === 'catalog' && chosenCatalog === 'badminton-21-w2-c30'" @click="chooseCatalog('badminton-21-w2-c30')">21 分／差 2／30 上限</button>
        <button type="button" data-testid="format-catalog-15" class="format-choice" :aria-pressed="mode === 'catalog' && chosenCatalog === 'badminton-15-w2-c21'" @click="chooseCatalog('badminton-15-w2-c21')">15 分／差 2／21 上限</button>
        <button type="button" data-testid="format-unknown" class="format-choice" :aria-pressed="mode === 'unknown'" @click="mode = 'unknown'">未知賽制</button>
      </div>
      <button type="button" class="format-choice mt-2" :aria-pressed="mode === 'custom'" @click="mode = 'custom'">自訂賽制</button>
      <fieldset v-if="mode === 'custom'" class="mt-2 grid gap-2">
        <label>名稱<input v-model="label" :aria-describedby="`${errorId}-label`" :aria-invalid="!!errors.label" /></label>
        <label>目標分數<input v-model="target" inputmode="numeric" :aria-describedby="`${errorId}-target`" :aria-invalid="!!errors.target" /></label>
        <label>勝分差<input v-model="winBy" inputmode="numeric" :aria-describedby="`${errorId}-win-by`" :aria-invalid="!!errors.winBy" /></label>
        <label>分數上限<input v-model="cap" inputmode="numeric" :aria-describedby="`${errorId}-cap`" :aria-invalid="!!errors.cap" /></label>
        <p :id="`${errorId}-label`" class="sr-only">{{ errors.label }}</p>
        <p :id="`${errorId}-target`" class="sr-only">{{ errors.target }}</p>
        <p :id="`${errorId}-win-by`" class="sr-only">{{ errors.winBy }}</p>
        <p :id="`${errorId}-cap`" class="sr-only">{{ errors.cap }}</p>
        <p class="text-sm text-red-700" aria-live="polite">{{ Object.values(errors).join('；') }}</p>
      </fieldset>
      <div class="mt-3 flex gap-2"><button type="button" class="format-choice" @click="cancel">取消</button><button type="button" class="format-choice bg-teal-700 text-white" @click="save">儲存賽制</button></div>
    </div>
  </section>
</template>

<style scoped>
.format-choice,.format-trigger{min-height:44px;padding:.6rem .8rem;border:1px solid #94a3b8;border-radius:.6rem;background:#fff}.format-draft{margin-top:.5rem;padding:.75rem;border:1px solid #cbd5e1;border-radius:.75rem;background:#fff}label{display:grid;gap:.25rem}input{min-height:44px;border:1px solid #94a3b8;border-radius:.4rem;padding:.4rem}
</style>
