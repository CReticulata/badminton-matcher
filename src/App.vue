<script setup lang="ts">
import { persistenceError, recoveryState, ui } from "./store";
import SessionView from "./components/SessionView.vue";
import PlayersView from "./components/PlayersView.vue";
import HistoryView from "./components/HistoryView.vue";
import PreviewView from "./components/PreviewView.vue";
import MatchDisplay from "./components/MatchDisplay.vue";
import ScoreInput from "./components/ScoreInput.vue";
import RecoveryView from "./components/RecoveryView.vue";

const version = __APP_VERSION__;

const tabs = [
  { key: "session", label: "場次" },
  { key: "players", label: "參賽者" },
  { key: "history", label: "歷史" },
] as const;
</script>

<template>
  <div class="min-h-svh bg-slate-100">
    <header
      class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur"
    >
      <div class="mx-auto flex max-w-2xl items-center px-4 py-2">
        <h1 class="text-base font-bold text-teal-800">羽球對戰分配機</h1>
        <span
          class="ml-auto font-mono text-[11px] tabular-nums text-slate-400"
          aria-label="版本號"
        >
          {{ version }}
        </span>
      </div>
    </header>

    <div
      v-if="persistenceError"
      role="alert"
      class="mx-auto mt-3 max-w-2xl rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
    >
      {{ persistenceError }}
    </div>

    <main>
      <RecoveryView v-if="recoveryState.status === 'blocked'" />
      <SessionView v-else-if="ui.view === 'session'" />
      <PlayersView v-else-if="ui.view === 'players'" />
      <HistoryView v-else />
    </main>

    <!-- 底部分頁列（復原期間不提供） -->
    <nav
      v-if="recoveryState.status === 'ready'"
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
    <template v-if="recoveryState.status === 'ready'">
      <PreviewView />
      <MatchDisplay />
      <ScoreInput />
    </template>
  </div>
</template>
