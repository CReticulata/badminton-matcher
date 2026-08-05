<script setup lang="ts">
import { computed } from 'vue'
import { playerById, ui } from '../store'
import { textColorOn } from '../lib/color'

const live = computed(() => ui.live)
const player = (id: string) => playerById.value.get(id)
const colorOf = (id: string) => player(id)?.color ?? '#555555'
const nameOf = (id: string) => player(id)?.name ?? '?'
const restNames = computed(() => (live.value?.resters ?? []).map(nameOf).join('、'))
</script>

<template>
  <!-- 對戰顯示畫面：高對比深底大字，遠距可讀 -->
  <div v-if="live" class="fixed inset-0 z-40 flex flex-col bg-slate-950 text-white">
    <!-- 橫式：左右分割、中間 VS -->
    <div class="hidden min-h-0 flex-1 landscape:flex">
      <div class="grid min-w-0 flex-1 gap-2 p-2" :class="live.mode === 'doubles' ? 'grid-rows-2' : 'grid-rows-1'">
        <div
          v-for="id in live.teamA"
          :key="id"
          class="flex items-center justify-center overflow-hidden rounded-2xl px-2"
          :style="{ backgroundColor: colorOf(id), color: textColorOn(colorOf(id)) }"
        >
          <span class="truncate text-center font-black" style="font-size: clamp(2rem, 9vw, 7rem)">
            {{ nameOf(id) }}
          </span>
        </div>
      </div>
      <div class="flex items-center px-1">
        <span class="font-black text-white/90" style="font-size: clamp(1.5rem, 5vw, 3.5rem)">VS</span>
      </div>
      <div class="grid min-w-0 flex-1 gap-2 p-2" :class="live.mode === 'doubles' ? 'grid-rows-2' : 'grid-rows-1'">
        <div
          v-for="id in live.teamB"
          :key="id"
          class="flex items-center justify-center overflow-hidden rounded-2xl px-2"
          :style="{ backgroundColor: colorOf(id), color: textColorOn(colorOf(id)) }"
        >
          <span class="truncate text-center font-black" style="font-size: clamp(2rem, 9vw, 7rem)">
            {{ nameOf(id) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 直式：上下堆疊 ＋ 建議轉橫提示 -->
    <div class="flex min-h-0 flex-1 flex-col landscape:hidden">
      <p class="py-1.5 text-center text-xs text-amber-300">建議將手機轉為橫式顯示</p>
      <div class="grid min-h-0 flex-1 gap-2 px-2" :class="live.mode === 'doubles' ? 'grid-rows-2' : 'grid-rows-1'">
        <div
          v-for="id in live.teamA"
          :key="id"
          class="flex items-center justify-center overflow-hidden rounded-2xl px-2"
          :style="{ backgroundColor: colorOf(id), color: textColorOn(colorOf(id)) }"
        >
          <span class="truncate text-center font-black" style="font-size: clamp(1.75rem, 12vw, 5rem)">
            {{ nameOf(id) }}
          </span>
        </div>
      </div>
      <div class="py-1 text-center text-2xl font-black text-white/90">VS</div>
      <div class="grid min-h-0 flex-1 gap-2 px-2" :class="live.mode === 'doubles' ? 'grid-rows-2' : 'grid-rows-1'">
        <div
          v-for="id in live.teamB"
          :key="id"
          class="flex items-center justify-center overflow-hidden rounded-2xl px-2"
          :style="{ backgroundColor: colorOf(id), color: textColorOn(colorOf(id)) }"
        >
          <span class="truncate text-center font-black" style="font-size: clamp(1.75rem, 12vw, 5rem)">
            {{ nameOf(id) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 底部列：休息名單＋結束按鈕 -->
    <div class="flex items-center gap-3 px-3 py-2">
      <p v-if="restNames" class="min-w-0 truncate text-sm text-white/50">休息：{{ restNames }}</p>
      <button
        class="ml-auto shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25"
        @click="ui.scoring = true"
      >
        結束比賽・輸入比分
      </button>
    </div>
  </div>
</template>
