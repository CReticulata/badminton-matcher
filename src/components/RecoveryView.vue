<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { blockedRawData, discardBlockedData, recoverFromCsvText } from '../store'

const heading = ref<HTMLElement | null>(null)
const fileError = ref('')
let recoveryAttempt = 0
onMounted(() => nextTick(() => heading.value?.focus()))
onBeforeUnmount(() => { recoveryAttempt++ })
function downloadRaw(): void {
  const raw = blockedRawData.value
  if (raw === null) return
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'badminton-matcher-recovery.json'; anchor.click(); URL.revokeObjectURL(url)
}
async function recover(event: Event): Promise<void> {
  const attempt = ++recoveryAttempt
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { fileError.value = 'CSV 超過 5 MiB，未讀取檔案內容'; return }
  try {
    const text = await file.text()
    if (attempt !== recoveryAttempt) return
    if (!recoverFromCsvText(text)) fileError.value = 'CSV 無法復原；保存的資料沒有變更'
  } catch {
    if (attempt === recoveryAttempt) fileError.value = 'CSV 無法讀取；保存的資料沒有變更'
  }
}
function discard(): void { if (window.confirm('確定捨棄保存的原始資料並重新開始？')) discardBlockedData(true) }
function keepBlocked(event: KeyboardEvent): void { if (event.key === 'Escape') event.preventDefault() }
</script>
<template>
  <main class="recovery-screen mx-auto max-w-2xl p-4" @keydown="keepBlocked"><h1 ref="heading" tabindex="-1" class="text-xl font-bold">需要資料復原</h1><p class="my-3">本機資料已保存，但無法安全載入。復原前不會寫入或顯示任何產品操作。</p><p v-if="fileError" aria-live="assertive" class="text-red-700">{{ fileError }}</p><button class="recovery-action rounded border px-3" @click="downloadRaw">下載原始 JSON</button><label class="recovery-action ml-2 inline-flex items-center rounded border px-3">從 CSV 復原<input class="sr-only" type="file" accept=".csv,text/csv" @change="recover" /></label><button class="recovery-action ml-2 rounded bg-red-700 px-3 text-white" @click="discard">確認捨棄並重新開始</button></main>
</template>

<style scoped>
.recovery-action { min-height: 44px; }
</style>
