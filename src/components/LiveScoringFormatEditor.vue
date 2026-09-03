<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  reconcileLiveScoreFlow,
  replaceLiveScoringFormat,
  resetLiveScoreFlow,
  type ReplaceLiveScoringFormatResult,
  ui,
} from '../store'
import {
  encodeScoringFormat,
  type ScoringFormatSnapshot,
} from '../lib/scoring-format'
import ScoringFormatPicker from './ScoringFormatPicker.vue'

const props = withDefaults(defineProps<{
  idPrefix: string
  triggerLabel?: string
}>(), {
  triggerLabel: '更換賽制',
})

const editing = ref(false)
const failure = ref('')
const live = computed(() => ui.live)
const triggerElement = ref<HTMLButtonElement | null>(null)
const dialogElement = ref<HTMLElement | null>(null)

const focusableElements = () => Array.from(
  dialogElement.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  ) ?? [],
)

const hasDraft = () => {
  const flow = reconcileLiveScoreFlow(live.value?.liveMatchId ?? null)
  return String(flow.scoreA).trim() !== '' || String(flow.scoreB).trim() !== ''
}

type ReplaceFailureReason = Extract<ReplaceLiveScoringFormatResult, { ok: false }>['reason']

function failureMessage(reason: ReplaceFailureReason): string {
  if (reason === 'persistence-failed') return '賽制未儲存，原本賽制與比分草稿均已保留。'
  if (reason === 'stale-live-match' || reason === 'live-authority-mismatch') {
    return '目前比賽已變更，未套用賽制；比分草稿已保留。'
  }
  if (reason === 'blocked') return '本機資料尚未復原，無法更換賽制。'
  return '無法更換目前比賽的賽制；比分草稿已保留。'
}

function openEditor() {
  failure.value = ''
  reconcileLiveScoreFlow(live.value?.liveMatchId ?? null)
  editing.value = true
  void nextTick(() => focusableElements()[0]?.focus())
}

function cancelEditor() {
  failure.value = ''
  editing.value = false
  void nextTick(() => triggerElement.value?.focus())
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditor()
    return
  }
  if (event.key !== 'Tab') return
  const elements = focusableElements()
  if (elements.length === 0) return
  const first = elements[0]!
  const last = elements[elements.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function save(snapshot: ScoringFormatSnapshot) {
  const current = live.value
  const liveMatchId = current?.liveMatchId
  if (!current || !liveMatchId) {
    failure.value = '找不到可更換賽制的進行中比賽。'
    return
  }
  if (encodeScoringFormat(current.scoringFormat) === encodeScoringFormat(snapshot)) {
    cancelEditor()
    return
  }
  if (hasDraft() && !window.confirm('更換賽制會清除目前輸入的比分與提示，確定要繼續嗎？')) return

  const result = replaceLiveScoringFormat(liveMatchId, snapshot)
  if (!result.ok) {
    failure.value = failureMessage(result.reason)
    return
  }
  if (result.liveMatchId !== liveMatchId) {
    failure.value = '賽制結果不屬於目前比賽；比分草稿已保留。'
    return
  }
  resetLiveScoreFlow(liveMatchId)
  cancelEditor()
}
</script>

<template>
  <div class="shrink-0">
    <button
      ref="triggerElement"
      type="button"
      class="min-h-11 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-teal-800"
      aria-label="更換本場賽制"
      @click="editing ? cancelEditor() : openEditor()"
    >
      {{ editing ? '收起賽制選擇' : triggerLabel }}
    </button>
    <div
      v-if="editing && live"
      ref="dialogElement"
      class="fixed inset-0 z-[70] overflow-y-auto bg-black/60 p-4 text-slate-900"
      role="dialog"
      aria-modal="true"
      aria-label="更換本場賽制"
      @keydown="handleDialogKeydown"
      @click.self="cancelEditor"
    >
      <div class="mx-auto mt-[max(1rem,env(safe-area-inset-top))] w-full max-w-md rounded-2xl bg-slate-50 p-4 text-left shadow-xl">
        <h3 class="mb-1 text-lg font-bold">更換本場賽制</h3>
        <p class="mb-3 text-xs text-slate-600">只套用到目前這一場，不改變活動預設或之後的比賽。</p>
        <ScoringFormatPicker
          :model-value="live.scoringFormat"
          :id-prefix="idPrefix"
          @save="save"
          @cancel="cancelEditor"
        />
      </div>
    </div>
    <p v-if="failure" role="alert" class="mt-2 text-sm font-medium text-red-700">{{ failure }}</p>
  </div>
</template>
