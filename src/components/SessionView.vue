<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  activePlayers,
  currentSession,
  endSession,
  joinSession,
  leaveSession,
  playerById,
  proposeRound,
  sessionStats,
  setSessionDefaultScoringFormat,
  startSession,
  toggleVolunteerRest,
  ui,
} from '../store'
import {
  createUnknownSnapshot,
  displayScoringFormat,
  type ScoringFormatSnapshot,
} from '../lib/scoring-format'
import PlayerChip from './PlayerChip.vue'
import ScoringFormatPicker from './ScoringFormatPicker.vue'

const checked = ref<Set<string>>(new Set())
const message = ref('')

/** 開場前必須明確選擇賽制；null 代表尚未選擇，不預選任何目錄項目 */
const newFormat = ref<ScoringFormatSnapshot | null>(null)
const editingDefault = ref(false)
const draftBase = computed(() => newFormat.value ?? createUnknownSnapshot('explicit-unknown'))

function toggleCheck(id: string) {
  const s = new Set(checked.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  checked.value = s
}

function onStart() {
  if (checked.value.size === 0 || !newFormat.value) return
  startSession([...checked.value], newFormat.value)
  checked.value = new Set()
  newFormat.value = null
  message.value = ''
}

const sess = currentSession

/** 舊資料的活動沒有賽制紀錄，下一場開打前必須先明確選擇 */
const needsLegacyChoice = computed(
  () => sess.value?.defaultScoringFormat.kind === 'unknown'
    && sess.value.defaultScoringFormat.reason === 'legacy-missing',
)

function onSaveDefault(snapshot: ScoringFormatSnapshot) {
  setSessionDefaultScoringFormat(snapshot)
  editingDefault.value = false
}
const presentPlayers = computed(() =>
  (sess.value?.presentIds ?? [])
    .map((id) => playerById.value.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p),
)
const absentPlayers = computed(() =>
  activePlayers.value.filter((p) => !sess.value?.presentIds.includes(p.id)),
)

function onPropose() {
  message.value = ''
  if (!proposeRound()) {
    const need = ui.mode === 'doubles' ? 4 : 2
    message.value = `可上場人數不足（${ui.mode === 'doubles' ? '雙打' : '單打'}需 ${need} 人，自願休息者不計）`
  }
}

function onEnd() {
  if (window.confirm('確定結束本場次？（全域名單與 rating 會保留）')) endSession()
}
</script>

<template>
  <div class="mx-auto max-w-2xl p-4 pb-24">
    <!-- 尚未開場：勾選今日出席者 -->
    <template v-if="!sess">
      <h2 class="mb-1 text-lg font-bold">開新場次</h2>
      <p class="mb-4 text-sm text-slate-500">勾選今日出席的人（中途也可再加入）</p>
      <p v-if="activePlayers.length === 0" class="py-10 text-center text-sm text-slate-500">
        全域名單是空的，請先到「參賽者」頁新增
      </p>
      <ul class="mb-4 space-y-2">
        <li v-for="p in activePlayers" :key="p.id">
          <label
            class="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 shadow-sm"
            :class="checked.has(p.id) ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200'"
          >
            <input
              type="checkbox"
              class="h-5 w-5 accent-teal-700"
              :checked="checked.has(p.id)"
              @change="toggleCheck(p.id)"
            />
            <PlayerChip :name="p.name" :color="p.color" />
            <span class="ml-auto text-sm tabular-nums text-slate-400">{{ Math.round(p.rating) }}</span>
          </label>
        </li>
      </ul>
      <div class="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="mb-2 text-sm text-slate-600">
          選擇今天的計分賽制。之後可以更改，但只會影響尚未開打的比賽。
        </p>
        <p v-if="newFormat" class="mb-2 text-sm font-medium text-teal-800">
          已選擇：{{ displayScoringFormat(newFormat) }}
        </p>
        <ScoringFormatPicker
          :model-value="draftBase"
          id-prefix="new-session-format"
          @save="newFormat = $event"
          @cancel="newFormat = null"
        />
      </div>
      <button
        class="min-h-11 w-full rounded-xl bg-teal-700 py-3 font-medium text-white disabled:opacity-40"
        :disabled="checked.size === 0 || !newFormat"
        @click="onStart"
      >
        開始場次（{{ checked.size }} 人）
      </button>
      <p v-if="checked.size > 0 && !newFormat" class="mt-2 text-center text-sm text-slate-500">
        請先選擇計分賽制
      </p>
    </template>

    <!-- 場次進行中 -->
    <template v-else>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-bold">{{ sess.name }}</h2>
        <button class="text-sm text-slate-400 hover:text-red-500" @click="onEnd">結束場次</button>
      </div>

      <!-- 單/雙打切換 -->
      <div class="mb-4 flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="group" aria-label="比賽模式">
        <button
          class="flex-1 py-2"
          :class="ui.mode === 'doubles' ? 'bg-teal-700 text-white' : 'bg-white text-slate-600'"
          @click="ui.mode = 'doubles'"
        >
          雙打
        </button>
        <button
          class="flex-1 py-2"
          :class="ui.mode === 'singles' ? 'bg-teal-700 text-white' : 'bg-white text-slate-600'"
          @click="ui.mode = 'singles'"
        >
          單打
        </button>
      </div>

      <p v-if="message" class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {{ message }}
      </p>

      <!-- 舊活動缺賽制紀錄：下一場開打前必須明確選擇，不由比分推測 -->
      <div
        v-if="needsLegacyChoice"
        class="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
      >
        <h3 class="mb-1 text-sm font-bold text-amber-900">這個活動沒有賽制紀錄</h3>
        <p class="mb-3 text-sm text-amber-900">
          這是升級前建立的活動。既有比賽維持「未知」不做更動；請為接下來的比賽明確選擇賽制。
        </p>
        <ScoringFormatPicker
          :model-value="sess.defaultScoringFormat"
          id-prefix="legacy-session-format"
          @save="onSaveDefault"
          @cancel="editingDefault = false"
        />
      </div>

      <template v-else>
        <div class="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span class="text-xs text-slate-500">賽制</span>
          <span class="text-sm">{{ displayScoringFormat(sess.defaultScoringFormat) }}</span>
          <button
            class="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-500"
            @click="editingDefault = !editingDefault"
          >
            {{ editingDefault ? '收起' : '更改' }}
          </button>
        </div>
        <div v-if="editingDefault" class="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="mb-2 text-sm text-slate-600">只影響尚未開打的比賽，已完成的紀錄不會變動。</p>
          <ScoringFormatPicker
            :model-value="sess.defaultScoringFormat"
            id-prefix="session-default-format"
            @save="onSaveDefault"
            @cancel="editingDefault = false"
          />
        </div>

        <button
          class="mb-2 min-h-11 w-full rounded-xl bg-teal-700 py-3 text-lg font-medium text-white hover:bg-teal-800"
          @click="onPropose"
        >
          產生下一場分組
        </button>
      </template>

      <!-- 在場名單 -->
      <h3 class="mb-2 mt-4 text-sm font-semibold text-slate-600">
        在場（{{ presentPlayers.length }} 人）
      </h3>
      <ul class="space-y-2">
        <li
          v-for="p in presentPlayers"
          :key="p.id"
          class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <PlayerChip :name="p.name" :color="p.color" />
          <span class="text-xs text-slate-400">
            上場 {{ sessionStats.get(p.id)?.played ?? 0 }}・休息
            {{ sessionStats.get(p.id)?.rested ?? 0 }}
          </span>
          <span class="ml-auto flex items-center gap-2">
            <button
              class="rounded-md border px-2 py-1 text-xs"
              :class="
                sess.volunteerRest.includes(p.id)
                  ? 'border-amber-400 bg-amber-100 text-amber-800'
                  : 'border-slate-300 text-slate-500'
              "
              @click="toggleVolunteerRest(p.id)"
            >
              {{ sess.volunteerRest.includes(p.id) ? '自願休息中' : '自願休息' }}
            </button>
            <button
              class="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-500"
              @click="leaveSession(p.id)"
            >
              離場
            </button>
          </span>
        </li>
      </ul>

      <!-- 中途加入 -->
      <template v-if="absentPlayers.length > 0">
        <h3 class="mb-2 mt-5 text-sm font-semibold text-slate-600">未出席（可中途加入）</h3>
        <ul class="space-y-2">
          <li
            v-for="p in absentPlayers"
            :key="p.id"
            class="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3"
          >
            <PlayerChip :name="p.name" :color="p.color" />
            <span v-if="sess.leftIds.includes(p.id)" class="text-xs text-slate-400">已離場</span>
            <button
              class="ml-auto rounded-md border border-teal-600 px-2 py-1 text-xs text-teal-700"
              @click="joinSession(p.id)"
            >
              {{ sess.leftIds.includes(p.id) ? '重新加入' : '加入' }}
            </button>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
