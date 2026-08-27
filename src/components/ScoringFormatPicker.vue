<script setup lang="ts">
/**
 * 賽制選擇器：編輯草稿而非直接改動已存的快照。
 * 儲存時整組驗證後才建立一份獨立快照，取消則丟棄草稿——半套的自訂值不會進入 store。
 */
import { computed, ref, watch } from 'vue'
import {
  SCORING_FORMAT_CATALOG,
  createCatalogSnapshot,
  createCustomSnapshot,
  createUnknownSnapshot,
  displayScoringFormat,
  type CatalogFormatId,
  type ScoringFormatSnapshot,
} from '../lib/scoring-format'

const props = defineProps<{ modelValue: ScoringFormatSnapshot; idPrefix: string }>()
const emit = defineEmits<{ save: [ScoringFormatSnapshot]; cancel: [] }>()

type DraftKind = CatalogFormatId | 'custom' | 'unknown'

const kind = ref<DraftKind>('unknown')
const label = ref('')
const target = ref('15')
const winBy = ref('2')
const cap = ref('21')
const error = ref('')

function reset() {
  const v = props.modelValue
  kind.value = v.kind === 'catalog' ? v.formatId : v.kind === 'custom' ? 'custom' : 'unknown'
  if (v.kind === 'custom') {
    label.value = v.label
    target.value = String(v.rules.target)
    winBy.value = String(v.rules.winBy)
    cap.value = String(v.rules.cap)
  }
  error.value = ''
}
watch(() => props.modelValue, reset, { immediate: true })

const isCustom = computed(() => kind.value === 'custom')

function onSave() {
  error.value = ''
  try {
    if (kind.value === 'unknown') {
      emit('save', createUnknownSnapshot('explicit-unknown'))
      return
    }
    if (kind.value === 'custom') {
      emit('save', createCustomSnapshot(label.value, {
        target: Number(target.value),
        winBy: Number(winBy.value),
        cap: Number(cap.value),
      }))
      return
    }
    emit('save', createCatalogSnapshot(kind.value))
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <div class="space-y-3">
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium text-slate-700">本場賽制</legend>
      <label
        v-for="entry in SCORING_FORMAT_CATALOG"
        :key="entry.formatId"
        class="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3"
        :class="kind === entry.formatId ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200'"
      >
        <input v-model="kind" type="radio" class="h-5 w-5 accent-teal-700" :value="entry.formatId" />
        <span class="text-sm">{{ displayScoringFormat(createCatalogSnapshot(entry.formatId)) }}</span>
      </label>

      <label
        class="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3"
        :class="isCustom ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200'"
      >
        <input v-model="kind" type="radio" class="h-5 w-5 accent-teal-700" value="custom" />
        <span class="text-sm">自訂賽制</span>
      </label>

      <label
        class="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3"
        :class="kind === 'unknown' ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200'"
      >
        <input v-model="kind" type="radio" class="h-5 w-5 accent-teal-700" value="unknown" />
        <span class="text-sm">未知（不記錄賽制）</span>
      </label>
    </fieldset>

    <div v-if="isCustom" class="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div>
        <label :for="`${idPrefix}-label`" class="block text-xs text-slate-500">名稱</label>
        <input
          :id="`${idPrefix}-label`"
          v-model="label"
          type="text"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="例如：友誼賽"
        />
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div v-for="f in [
          { id: 'target', text: '目標分', model: target },
          { id: 'winBy', text: '需領先', model: winBy },
          { id: 'cap', text: '分數上限', model: cap },
        ]" :key="f.id">
          <label :for="`${idPrefix}-${f.id}`" class="block text-xs text-slate-500">{{ f.text }}</label>
          <input
            :id="`${idPrefix}-${f.id}`"
            :value="f.model"
            type="number"
            inputmode="numeric"
            min="1"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            @input="f.id === 'target' ? (target = String(($event.target as HTMLInputElement).value))
              : f.id === 'winBy' ? (winBy = String(($event.target as HTMLInputElement).value))
              : (cap = String(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>

    <p v-if="error" :id="`${idPrefix}-error`" role="alert" class="text-sm font-medium text-red-700">
      {{ error }}
    </p>

    <div class="flex gap-2">
      <button
        type="button"
        class="min-h-11 flex-1 rounded-xl bg-teal-700 py-3 font-medium text-white"
        @click="onSave"
      >
        儲存賽制
      </button>
      <button
        type="button"
        class="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
        @click="reset(); emit('cancel')"
      >
        取消
      </button>
    </div>
  </div>
</template>
