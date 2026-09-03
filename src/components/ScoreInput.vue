<script setup lang="ts">
import { computed } from 'vue'
import { playerById, reconcileLiveScoreFlow, submitScore, ui } from '../store'
import { displayScoringFormat, isLegalEndpoint, isStructured } from '../lib/scoring-format'
import LiveScoringFormatEditor from './LiveScoringFormatEditor.vue'

const scoreA = computed<string | number>({
  get: () => reconcileLiveScoreFlow().scoreA,
  set: (value) => { reconcileLiveScoreFlow().scoreA = value },
})
const scoreB = computed<string | number>({
  get: () => reconcileLiveScoreFlow().scoreB,
  set: (value) => { reconcileLiveScoreFlow().scoreB = value },
})
const error = computed<string>({
  get: () => reconcileLiveScoreFlow().error,
  set: (value) => { reconcileLiveScoreFlow().error = value },
})

/** type="number" 的 v-model 可能是 number 或 string */
const toInt = (v: string | number): number => {
  const s = String(v).trim()
  return s === '' ? NaN : Number(s)
}

const live = computed(() => ui.live)
const names = (ids: string[]) =>
  ids.map((id) => playerById.value.get(id)?.name ?? '?').join('、')

/**
 * 目前輸入是否只差在「不符合賽制」——基本規則都過了，只有賽制這關沒過。
 * 強制記錄按鈕只在這種情況出現；平手或負數不提供強制。
 */
const canForceUnrated = computed(() => {
  const format = live.value?.scoringFormat
  if (!format) return false
  const a = toInt(scoreA.value)
  const b = toInt(scoreB.value)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) return false
  return isStructured(format) && !isLegalEndpoint(format, a, b)
})

function record(options?: { forceUnrated: boolean }) {
  const a = toInt(scoreA.value)
  const b = toInt(scoreB.value)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    error.value = '比分必須是非負整數'
    return
  }
  const err = submitScore(a, b, options)
  if (err) {
    error.value = err
    return
  }
  scoreA.value = ''
  scoreB.value = ''
  error.value = ''
}

const onSubmit = () => record()
const onForce = () => record({ forceUnrated: true })
</script>

<template>
  <div
    v-if="live && ui.scoring"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div class="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <h2 class="mb-1 text-center text-lg font-bold text-slate-800">輸入比分</h2>
      <!-- 目前live match的賽制；下方共用editor可在完賽前整份替換 -->
      <p class="mb-4 text-center text-xs text-slate-500">
        {{ displayScoringFormat(live.scoringFormat) }}
      </p>
      <div class="mb-4 text-center">
        <LiveScoringFormatEditor id-prefix="score-live-format" />
      </div>
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
      <p v-if="error" role="alert" class="mb-3 text-center text-sm text-red-600">{{ error }}</p>

      <!-- 只在提醒不合賽制之後出現：讓使用者先看到問題，再決定要不要照樣記錄 -->
      <div
        v-if="error && canForceUnrated"
        class="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
      >
        <p class="mb-2 text-sm text-amber-900">
          仍要記錄這個比分嗎？這場會保留在歷史與上場次數中，但
          <strong>不會計入任何人的強度分數</strong>。
        </p>
        <button
          class="min-h-11 w-full rounded-xl border border-amber-500 bg-white py-3 text-sm font-medium text-amber-900"
          @click="onForce"
        >
          強制結束這場（不計入強度）
        </button>
      </div>

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
