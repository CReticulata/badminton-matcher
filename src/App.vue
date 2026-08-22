<script setup lang="ts">
import { recoveryState, ui } from "./store";
import RecoveryView from "./components/RecoveryView.vue";
import SessionView from "./components/SessionView.vue";
import PlayersView from "./components/PlayersView.vue";
import HistoryView from "./components/HistoryView.vue";
import PreviewView from "./components/PreviewView.vue";
import MatchDisplay from "./components/MatchDisplay.vue";
import ScoreInput from "./components/ScoreInput.vue";

const tabs = [
  { key: "session", label: "場次" },
  { key: "players", label: "參賽者" },
  { key: "history", label: "歷史" },
] as const;
</script>

<template>
  <div v-if="recoveryState === 'blocked'" class="min-h-svh bg-slate-100"><RecoveryView /></div>
  <div v-else class="min-h-svh bg-slate-100">
    <header
      class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur"
    >
      <div class="mx-auto flex max-w-2xl items-center px-4 py-2">
        <h1 class="text-base font-bold text-teal-800">羽球對戰分配機</h1>
      </div>
    </header>

    <main>
      <SessionView v-if="ui.view === 'session'" />
      <PlayersView v-else-if="ui.view === 'players'" />
      <HistoryView v-else />
    </main>

    <!-- 底部分頁列 -->
    <nav
      class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="主選單"
    >
      <div class="mx-auto flex max-w-2xl">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="flex-1 py-3 text-sm font-medium"
          :class="ui.view === t.key ? 'text-teal-700' : 'text-slate-400'"
          :aria-current="ui.view === t.key ? 'page' : undefined"
          @click="ui.view = t.key"
        >
          {{ t.label }}
        </button>
      </div>
    </nav>

    <!-- 覆蓋層流程：分組預覽 → 對戰顯示 → 比分輸入 -->
    <PreviewView />
    <MatchDisplay />
    <ScoreInput />
  </div>
</template>
