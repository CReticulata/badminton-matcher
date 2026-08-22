<script setup lang="ts">
import { computed, ref } from 'vue'
import { currentSession, data, endSession, joinSession, leaveSession, playerById, proposeRound, sessionStats, setSessionDefaultScoringFormat, startSession, toggleVolunteerRest, ui } from '../store'
import type { ScoringFormatSnapshot } from '../lib/scoring-format'
import { displayScoringFormat } from '../lib/scoring-format'
import PlayerChip from './PlayerChip.vue'
import ScoringFormatPicker from './ScoringFormatPicker.vue'

const checked = ref<Set<string>>(new Set())
const selectedFormat = ref<ScoringFormatSnapshot | null>(null)
const message = ref('')
const sess = currentSession
const presentPlayers = computed(() => (sess.value?.presentIds ?? []).map((id) => playerById.value.get(id)).filter(Boolean))
const absentPlayers = computed(() => data.players.filter((p) => !sess.value?.presentIds.includes(p.id)))
function toggleCheck(id: string): void { const next = new Set(checked.value); next.has(id) ? next.delete(id) : next.add(id); checked.value = next }
function onStart(): void { if (!checked.value.size || !selectedFormat.value) return; startSession([...checked.value], selectedFormat.value); checked.value = new Set(); selectedFormat.value = null }
function onPropose(): void { message.value = ''; if (!proposeRound()) message.value = '請先選擇明確的計分賽制，且確認可上場人數足夠' }
function saveDefault(snapshot: ScoringFormatSnapshot): void { setSessionDefaultScoringFormat(snapshot) }
function onEnd(): void { if (window.confirm('確定結束本場次？')) endSession() }
</script>

<template>
  <div class="mx-auto max-w-2xl p-4 pb-24">
    <template v-if="!sess">
      <h2 class="mb-1 text-lg font-bold">開新場次</h2><p class="mb-4 text-sm text-slate-500">勾選今日出席者，並明確選擇計分賽制</p>
      <ul class="mb-4 space-y-2"><li v-for="p in data.players" :key="p.id"><label class="flex min-h-11 items-center gap-3 rounded-xl border bg-white p-3"><input type="checkbox" :checked="checked.has(p.id)" @change="toggleCheck(p.id)" /><PlayerChip :name="p.name" :color="p.color" /><span class="ml-auto">{{ Math.round(p.rating) }}</span></label></li></ul>
      <ScoringFormatPicker :model-value="selectedFormat" title="選擇計分賽制" @save="selectedFormat = $event" @cancel="undefined" />
      <button data-testid="start-session" class="mt-3 w-full min-h-11 rounded-xl bg-teal-700 py-3 font-medium text-white disabled:opacity-40" :disabled="checked.size === 0 || !selectedFormat" @click="onStart">開始場次（{{ checked.size }} 人）</button>
    </template>
    <template v-else>
      <div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-bold">{{ sess.name }}</h2><button class="min-h-11 text-sm text-slate-500" @click="onEnd">結束場次</button></div>
      <section v-if="sess.defaultScoringFormat.kind === 'unknown' && sess.defaultScoringFormat.reason === 'legacy-missing'" class="rounded-xl border border-amber-500 bg-amber-50 p-3" aria-labelledby="legacy-format-heading"><h3 id="legacy-format-heading" tabindex="-1" class="font-semibold">需要選擇計分賽制</h3><p class="text-sm">此舊場次沒有可靠的賽制資料。選擇後才可開始下一場。</p><ScoringFormatPicker blocking title="選擇計分賽制" @save="saveDefault" @cancel="undefined" /></section>
      <template v-else>
        <section class="mb-3"><h3 class="font-semibold">場次預設賽制</h3><p class="text-sm">{{ displayScoringFormat(sess.defaultScoringFormat) }}</p><ScoringFormatPicker :model-value="sess.defaultScoringFormat" title="變更未開始比賽的預設賽制" @save="saveDefault" @cancel="undefined" /></section>
        <div class="mb-4 flex rounded-lg border" role="group" aria-label="比賽模式"><button class="min-h-11 flex-1" @click="ui.mode='doubles'">雙打</button><button class="min-h-11 flex-1" @click="ui.mode='singles'">單打</button></div>
        <p v-if="message" aria-live="polite" class="mb-2 text-sm text-amber-800">{{ message }}</p><button class="w-full min-h-11 rounded-xl bg-teal-700 py-3 text-lg font-medium text-white" @click="onPropose">產生下一場分組</button>
      </template>
      <h3 class="mb-2 mt-4 text-sm font-semibold">在場（{{ presentPlayers.length }} 人）</h3><ul class="space-y-2"><li v-for="p in presentPlayers" :key="p!.id" class="flex items-center gap-2 rounded-xl border bg-white p-3"><PlayerChip :name="p!.name" :color="p!.color"/><span class="text-xs">上場 {{ sessionStats.get(p!.id)?.played ?? 0 }}・休息 {{ sessionStats.get(p!.id)?.rested ?? 0 }}</span><span class="ml-auto"><button class="min-h-11 px-2" @click="toggleVolunteerRest(p!.id)">自願休息</button><button class="min-h-11 px-2" @click="leaveSession(p!.id)">離場</button></span></li></ul>
      <ul v-if="absentPlayers.length" class="mt-4 space-y-2"><li v-for="p in absentPlayers" :key="p.id" class="flex items-center gap-2 rounded-xl border p-3"><PlayerChip :name="p.name" :color="p.color"/><button class="ml-auto min-h-11 px-2" @click="joinSession(p.id)">加入</button></li></ul>
    </template>
  </div>
</template>
