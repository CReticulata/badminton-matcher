<script setup lang="ts">
import { computed, ref } from 'vue'
import { cancelPending, playerById, proposeRound, resetPendingScoringFormat, setPendingScoringFormat, startMatch, swapInPending, ui } from '../store'
import { displayScoringFormat, type ScoringFormatSnapshot } from '../lib/scoring-format'
import ScoringFormatPicker from './ScoringFormatPicker.vue'
import { textColorOn } from '../lib/color'

const selected = ref<string | null>(null)

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
function saveOverride(snapshot: ScoringFormatSnapshot): void { setPendingScoringFormat(snapshot) }
</script>

<template>
  <div v-if="pending" class="fixed inset-0 z-40 overflow-y-auto bg-slate-100">
    <div class="mx-auto max-w-2xl p-4">
      <h2 class="mb-1 text-lg font-bold">分組預覽</h2>
      <p class="mb-4 text-sm text-slate-500">點選兩人可交換位置（含休息名單）</p>

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

      <section class="mb-4 rounded-xl bg-white p-3"><h3 class="font-semibold">本場計分賽制</h3><p class="text-sm">{{ displayScoringFormat(pending.scoringFormat) }}</p><ScoringFormatPicker :model-value="pending.scoringFormat" title="本場覆寫賽制" @save="saveOverride" @cancel="undefined" /><button type="button" class="mt-2 min-h-11 rounded border px-3" @click="resetPendingScoringFormat">使用場次預設</button></section>

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
