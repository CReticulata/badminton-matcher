<script setup lang="ts">
/**
 * 阻斷式復原畫面：本機資料讀不懂時取代所有產品操作。
 * 原始值已原樣保留、自動儲存已停用；只提供下載、匯入、明確捨棄三個動作。
 */
import { onMounted, ref } from 'vue'
import { discardBlockedData, importCsvText, recoveryState } from '../store'

const heading = ref<HTMLElement | null>(null)
const error = ref('')

onMounted(() => heading.value?.focus())

const blocked = () => (recoveryState.value.status === 'blocked' ? recoveryState.value : null)

function onDownload() {
  const state = blocked()
  if (!state) return
  const blob = new Blob([state.raw], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'badminton-matcher-preserved.json'
  a.click()
  URL.revokeObjectURL(url)
}

async function onImport(event: Event) {
  error.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    importCsvText(await file.text())
  } catch (e) {
    error.value = (e as Error).message
  }
}

function onDiscard() {
  if (!window.confirm('確定捨棄無法讀取的本機資料並從空白開始？此動作無法復原，建議先下載保留的原始資料。')) return
  discardBlockedData()
}
</script>

<template>
  <div class="mx-auto max-w-2xl p-4">
    <h2 ref="heading" tabindex="-1" class="text-lg font-bold text-red-800">無法讀取本機資料</h2>
    <p class="mt-2 text-sm text-slate-700">
      這個裝置上的資料無法辨識，已<strong>原樣保留</strong>，自動儲存暫時停用以免覆蓋。
      請先下載保留的原始資料，再選擇匯入 CSV 備份還原，或捨棄後從空白開始。
    </p>
    <p class="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
      {{ recoveryState.status === 'blocked' ? recoveryState.message : '' }}
    </p>

    <div class="mt-4 space-y-2">
      <button
        type="button"
        class="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-3 font-medium"
        @click="onDownload"
      >
        下載保留的原始資料
      </button>

      <label
        class="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-teal-700 py-3 font-medium text-white"
      >
        匯入 CSV 備份還原
        <input type="file" accept=".csv,text/csv" class="hidden" @change="onImport" />
      </label>

      <button
        type="button"
        class="min-h-11 w-full rounded-xl border border-red-300 bg-white py-3 font-medium text-red-700"
        @click="onDiscard"
      >
        捨棄並從空白開始
      </button>
    </div>

    <p v-if="error" role="alert" aria-live="polite" class="mt-3 text-sm font-medium text-red-700">
      {{ error }}
    </p>
  </div>
</template>
