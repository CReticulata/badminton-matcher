<script setup lang="ts">
import { ref } from "vue";
import {
  INITIAL_LEVELS,
  addPlayer,
  data,
  exportCsvText,
  importCsvText,
  overrideRating,
  removePlayer,
  renamePlayer,
  setPlayerColor,
  totalStats,
} from "../store";
import { textColorOn } from "../lib/color";

const newName = ref("");
const newLevel = ref(1500);
const message = ref("");

function onAdd() {
  if (!newName.value.trim()) return;
  addPlayer(newName.value, newLevel.value);
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
  overrideRating(id, n);
  message.value = "";
}

function onDelete(id: string, name: string) {
  if (!window.confirm(`確定刪除「${name}」？`)) return;
  if (!removePlayer(id)) {
    message.value = "此人已有比賽紀錄，無法刪除（避免歷史不一致）";
  }
}

function onExport() {
  const csv = exportCsvText();
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  a.href = url;
  a.download = `badminton-matcher-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
    <form class="mb-4 flex gap-2" @submit.prevent="onAdd">
      <input
        v-model="newName"
        placeholder="名字"
        class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      <select
        v-model.number="newLevel"
        class="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
        aria-label="初始等級"
      >
        <option
          v-for="lv in INITIAL_LEVELS"
          :key="lv.rating"
          :value="lv.rating"
        >
          {{ lv.label }}（{{ lv.rating }}）
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
      v-if="data.players.length === 0"
      class="py-10 text-center text-sm text-slate-500"
    >
      還沒有參賽者，先新增幾位吧
    </p>

    <!-- 列表：名字 / 分數 / 比賽次數 / 休息次數 / 顏色 -->
    <ul class="space-y-2">
      <li
        v-for="p in data.players"
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
            @click="onDelete(p.id, p.name)"
          >
            刪除
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
