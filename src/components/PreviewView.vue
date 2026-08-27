<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  cancelPending,
  currentSession,
  playerById,
  proposeRound,
  setPendingScoringFormat,
  startMatch,
  swapInPending,
  ui,
} from '../store'
import { textColorOn } from '../lib/color'
import { cloneScoringFormat, displayScoringFormat } from '../lib/scoring-format'
import ScoringFormatPicker from './ScoringFormatPicker.vue'

const selected = ref<string | null>(null)
const editingFormat = ref(false)

function onSaveFormat(snapshot: Parameters<typeof setPendingScoringFormat>[0]) {
  setPendingScoringFormat(snapshot)
  editingFormat.value = false
}

/** 回到活動預設：取一份新的副本，不與活動共用物件 */
function useSessionDefault() {
  const session = currentSession.value
  if (!session) return
  setPendingScoringFormat(cloneScoringFormat(session.defaultScoringFormat))
  editingFormat.value = false
}

function tap(id: string) {
  if (selected.value === null) {
    selected.value = id
  } else if (selected.value === id) {
    selected.value = null
  } else {
    swapInPending(selected.value, id)
    selected.value = null
  }
}

const pending = computed(() => ui.pending)
const player = (id: string) => playerById.value.get(id)
</script>

<template>
  <div v-if="pending" class="fixed inset-0 z-40 overflow-y-auto bg-slate-100">
    <div class="mx-auto max-w-2xl p-4">
      <h2 class="mb-1 text-lg font-bold">分組預覽</h2>
      <p class="mb-4 text-sm text-slate-500">點選兩人可交換位置（含休息名單）</p>

      <!-- 賽制：開打前可覆寫，開打後凍結 -->
      <div class="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <span class="text-xs text-slate-500">賽制</span>
        <span class="text-sm">{{ displayScoringFormat(pending.scoringFormat) }}</span>
        <button
          class="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-500"
          @click="editingFormat = !editingFormat"
        >
          {{ editingFormat ? '收起' : '本場更改' }}
        </button>
      </div>
      <div v-if="editingFormat" class="mb-3 rounded-xl border border-slate-200 bg-white p-3">
        <p class="mb-2 text-sm text-slate-600">只套用到這一場，不改變活動預設。</p>
        <ScoringFormatPicker
          :model-value="pending.scoringFormat"
          id-prefix="pending-format"
          @save="onSaveFormat"
          @cancel="editingFormat = false"
        />
        <button
          class="mt-2 min-h-11 w-full rounded-xl border border-slate-300 py-2 text-sm text-slate-600"
          @click="useSessionDefault"
        >
          使用活動預設
        </button>
      </div>

      <div class="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div class="space-y-2">
          <div class="text-center text-xs font-semibold text-slate-500">A 隊</div>
          <button
            v-for="id in pending.teamA"
            :key="id"
            class="block w-full rounded-xl border-2 p-4 text-center text-lg font-bold"
            :class="selected === id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-transparent'"
            :style="{
              backgroundColor: player(id)?.color ?? '#888',
              color: textColorOn(player(id)?.color ?? '#888'),
            }"
            @click="tap(id)"
          >
            {{ player(id)?.name ?? '?' }}
          </button>
        </div>
        <div class="text-xl font-black text-slate-400">VS</div>
        <div class="space-y-2">
          <div class="text-center text-xs font-semibold text-slate-500">B 隊</div>
          <button
            v-for="id in pending.teamB"
            :key="id"
            class="block w-full rounded-xl border-2 p-4 text-center text-lg font-bold"
            :class="selected === id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-transparent'"
            :style="{
              backgroundColor: player(id)?.color ?? '#888',
              color: textColorOn(player(id)?.color ?? '#888'),
            }"
            @click="tap(id)"
          >
            {{ player(id)?.name ?? '?' }}
          </button>
        </div>
      </div>

      <template v-if="pending.resters.length > 0">
        <div class="mb-2 text-xs font-semibold text-slate-500">本場休息</div>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="id in pending.resters"
            :key="id"
            class="rounded-full border-2 px-4 py-2 text-sm font-medium"
            :class="selected === id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-transparent'"
            :style="{
              backgroundColor: player(id)?.color ?? '#888',
              color: textColorOn(player(id)?.color ?? '#888'),
            }"
            @click="tap(id)"
          >
            {{ player(id)?.name ?? '?' }}
          </button>
        </div>
      </template>

      <div class="flex gap-2">
        <button
          class="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm text-slate-600"
          @click="cancelPending()"
        >
          取消
        </button>
        <button
          class="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm text-slate-600"
          @click="proposeRound()"
        >
          重新產生
        </button>
        <button
          class="flex-2 rounded-xl bg-teal-700 py-3 font-medium text-white hover:bg-teal-800"
          @click="startMatch()"
        >
          開始比賽
        </button>
      </div>
    </div>
  </div>
</template>
