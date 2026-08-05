<script setup lang="ts">
import { computed, ref } from 'vue'
import { playerById, submitScore, ui } from '../store'

const scoreA = ref<string | number>('')
const scoreB = ref<string | number>('')
const error = ref('')

/** type="number" 的 v-model 可能是 number 或 string */
const toInt = (v: string | number): number => {
  const s = String(v).trim()
  return s === '' ? NaN : Number(s)
}

const live = computed(() => ui.live)
const names = (ids: string[]) =>
  ids.map((id) => playerById.value.get(id)?.name ?? '?').join('、')

function onSubmit() {
  const a = toInt(scoreA.value)
  const b = toInt(scoreB.value)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    error.value = '比分必須是非負整數'
    return
  }
  const err = submitScore(a, b)
  if (err) {
    error.value = err
    return
  }
  scoreA.value = ''
  scoreB.value = ''
  error.value = ''
}
</script>

<template>
  <div
    v-if="live && ui.scoring"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
      <h2 class="mb-4 text-center text-lg font-bold text-slate-800">輸入比分</h2>
      <div class="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div class="text-center">
          <p class="mb-2 text-sm font-medium text-slate-600">{{ names(live.teamA) }}</p>
          <input
            v-model="scoreA"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            class="w-full rounded-xl border border-slate-300 py-3 text-center text-3xl font-bold tabular-nums"
            aria-label="A 隊得分"
          />
        </div>
        <span class="pt-6 text-sm font-bold text-slate-400">:</span>
        <div class="text-center">
          <p class="mb-2 text-sm font-medium text-slate-600">{{ names(live.teamB) }}</p>
          <input
            v-model="scoreB"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            class="w-full rounded-xl border border-slate-300 py-3 text-center text-3xl font-bold tabular-nums"
            aria-label="B 隊得分"
          />
        </div>
      </div>
      <p v-if="error" class="mb-3 text-center text-sm text-red-600">{{ error }}</p>
      <div class="flex gap-2">
        <button
          class="flex-1 rounded-xl border border-slate-300 py-3 text-sm text-slate-600"
          @click="ui.scoring = false"
        >
          返回對戰畫面
        </button>
        <button class="flex-2 rounded-xl bg-teal-700 py-3 font-medium text-white" @click="onSubmit">
          儲存並記錄
        </button>
      </div>
    </div>
  </div>
</template>
