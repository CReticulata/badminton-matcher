<script setup lang="ts">
import { ref } from "vue";
import {
  INITIAL_LEVELS,
  activePlayers,
  addPlayer,
  archivePlayer,
  archivedPlayers,
  currentSession,
  downloadCsvBackup,
  importCsvText,
  overrideRating,
  renamePlayer,
  restorePlayer,
  setPlayerColor,
  totalStats,
} from "../store";
import { textColorOn } from "../lib/color";

const newName = ref("");
const newRating = ref<number>(
  INITIAL_LEVELS.find((level) => level.level === 8)?.rating ?? 1500,
);
const message = ref("");
const showArchived = ref(false);

function onAdd() {
  if (!newName.value.trim()) return;
  addPlayer(newName.value, newRating.value);
  newName.value = "";
}

function onOverride(id: string, current: number) {
  const input = window.prompt(
    "手動覆寫強度分數（RD 將重設為 350）",
    String(Math.round(current)),
  );
  if (input === null) return;
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) {
    message.value = "請輸入有效的正數分數";
    return;
  }
  if (!overrideRating(id, n)) {
    message.value = "活動進行中不可手動調整強度分數";
    return;
  }
  message.value = "";
}

function onArchive(id: string, name: string) {
  if (!window.confirm(`確定封存「${name}」？歷史與 CSV 仍會保留此人。`)) return;
  if (!archivePlayer(id)) {
    message.value = "活動進行中不可封存球員";
    return;
  }
  message.value = "已封存，可從下方「已封存」區塊還原";
}

function onExport() {
  downloadCsvBackup();
}

const fileInput = ref<HTMLInputElement>();

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (
    !window.confirm(
      "匯入將「覆蓋」目前所有資料（參賽者、場次、比賽紀錄），確定嗎？",
    )
  )
    return;
  try {
    importCsvText(await file.text());
    message.value = "匯入完成";
  } catch (err) {
    message.value = `匯入失敗：${err instanceof Error ? err.message : String(err)}`;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl p-4 pb-24">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-bold">參賽者</h2>
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          @click="onExport"
        >
          匯出 CSV
        </button>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          @click="fileInput?.click()"
        >
          匯入 CSV
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          @change="onImportFile"
        />
      </div>
    </div>

    <p
      v-if="message"
      class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      {{ message }}
    </p>

    <!-- 新增 -->
    <form class="mb-4 flex flex-col gap-2 sm:flex-row" @submit.prevent="onAdd">
      <input
        v-model="newName"
        placeholder="名字"
        class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      <select
        v-model.number="newRating"
        class="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm sm:w-auto"
        aria-label="初始等級"
      >
        <option
          v-for="lv in INITIAL_LEVELS"
          :key="lv.level"
          :value="lv.rating"
        >
          {{ lv.level }} 級｜{{ lv.tier }}
        </option>
      </select>
      <button
        type="submit"
        class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
      >
        新增
      </button>
    </form>

    <p
      v-if="activePlayers.length === 0"
      class="py-10 text-center text-sm text-slate-500"
    >
      還沒有參賽者，先新增幾位吧
    </p>

    <!-- 列表：名字 / 分數 / 比賽次數 / 休息次數 / 顏色 -->
    <ul class="space-y-2">
      <li
        v-for="p in activePlayers"
        :key="p.id"
        class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div class="flex items-center gap-3">
          <label
            class="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-slate-300"
            :style="{ backgroundColor: p.color }"
            :title="`更改 ${p.name} 的代表顏色`"
          >
            <input
              type="color"
              :value="p.color"
              class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              :aria-label="`${p.name} 的代表顏色`"
              @input="
                setPlayerColor(p.id, ($event.target as HTMLInputElement).value)
              "
            />
            <span
              class="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px]"
              :style="{ color: textColorOn(p.color) }"
              >{{ p.name.slice(0, 2) }}</span
            >
          </label>
          <input
            :value="p.name"
            class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium hover:border-slate-300 focus:border-slate-400 focus:outline-none"
            aria-label="名字"
            @change="
              renamePlayer(p.id, ($event.target as HTMLInputElement).value)
            "
          />
          <div class="text-right">
            <button
              class="text-base font-bold tabular-nums text-slate-800 underline decoration-dotted underline-offset-4"
              :title="`RD ${Math.round(p.rd)}，點擊手動覆寫`"
              :disabled="!!currentSession"
              @click="onOverride(p.id, p.rating)"
            >
              {{ Math.round(p.rating) }}
            </button>
          </div>
        </div>
        <div class="mt-2 flex items-center gap-4 pl-12 text-xs text-slate-500">
          <span>比賽 {{ totalStats.get(p.id)?.played ?? 0 }} 場</span>
          <span>休息 {{ totalStats.get(p.id)?.rested ?? 0 }} 次</span>
          <span>RD {{ Math.round(p.rd) }}</span>
          <button
            class="ml-auto text-red-400 hover:text-red-600"
            :disabled="!!currentSession"
            :title="currentSession ? '活動進行中不可封存' : '封存球員'"
            @click="onArchive(p.id, p.name)"
          >
            封存
          </button>
        </div>
      </li>
    </ul>

    <section v-if="archivedPlayers.length" class="mt-6 border-t border-slate-200 pt-4">
      <button
        class="flex w-full items-center justify-between text-sm font-semibold text-slate-600"
        @click="showArchived = !showArchived"
      >
        <span>已封存（{{ archivedPlayers.length }}）</span>
        <span>{{ showArchived ? '收合' : '展開' }}</span>
      </button>
      <ul v-if="showArchived" class="mt-3 space-y-2">
        <li
          v-for="p in archivedPlayers"
          :key="p.id"
          class="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <span class="font-medium text-slate-600">{{ p.name }}</span>
          <span class="ml-2 text-xs tabular-nums text-slate-400">{{ Math.round(p.rating) }}</span>
          <button class="ml-auto text-sm font-medium text-teal-700 hover:underline" @click="restorePlayer(p.id)">
            還原
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
