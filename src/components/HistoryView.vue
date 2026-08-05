<script setup lang="ts">
import { computed, ref } from 'vue'
import { data, deleteMatch, editMatchScore, playerById } from '../store'
import PlayerChip from './PlayerChip.vue'
import type { Match, Session } from '../types'

const editing = ref<string | null>(null)
const editA = ref('')
const editB = ref('')
const error = ref('')

/** 依場次分群（新→舊） */
const groups = computed(() => {
  const bySession = new Map<string, Match[]>()
  for (const m of data.matches) {
    const list = bySession.get(m.sessionId) ?? []
    list.push(m)
    bySession.set(m.sessionId, list)
  }
  const out: { session: Session | null; sessionId: string; matches: Match[] }[] = []
  for (const [sessionId, matches] of bySession) {
    out.push({
      sessionId,
      session: data.sessions.find((s) => s.id === sessionId) ?? null,
      matches: matches.slice().sort((a, b) => b.at - a.at),
    })
  }
  return out.sort((a, b) => (b.session?.startedAt ?? 0) - (a.session?.startedAt ?? 0))
})

const player = (id: string) => playerById.value.get(id)
const time = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function startEdit(m: Match) {
  editing.value = m.id
  editA.value = String(m.scoreA)
  editB.value = String(m.scoreB)
  error.value = ''
}

/** type="number" 的 v-model 可能是 number 或 string，空字串要擋下而不是變 0 */
const toInt = (v: string | number): number => {
  const s = String(v).trim()
  return s === '' ? NaN : Number(s)
}

function saveEdit(m: Match) {
  const a = toInt(editA.value)
  const b = toInt(editB.value)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    error.value = '比分必須是非負整數'
    return
  }
  const err = editMatchScore(m.id, a, b)
  if (err) {
    error.value = err
    return
  }
  editing.value = null
  error.value = ''
}

function onDelete(m: Match) {
  if (!window.confirm('確定刪除這場紀錄？所有人的 rating 會從完整歷史重算。')) return
  deleteMatch(m.id)
}
</script>

<template>
  <div class="mx-auto max-w-2xl p-4 pb-24">
    <h2 class="mb-1 text-lg font-bold">歷史紀錄</h2>
    <p class="mb-4 text-sm text-slate-500">修改或刪除後，所有人的強度分數會從完整歷史全量重算</p>

    <p v-if="groups.length === 0" class="py-10 text-center text-sm text-slate-500">還沒有比賽紀錄</p>

    <section v-for="g in groups" :key="g.sessionId" class="mb-6">
      <h3 class="mb-2 text-sm font-semibold text-slate-600">
        {{ g.session?.name ?? '（未知場次）' }}
      </h3>
      <ul class="space-y-2">
        <li
          v-for="m in g.matches"
          :key="m.id"
          class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div class="mb-1 flex items-center text-xs text-slate-400">
            <span>{{ time(m.at) }}</span>
            <span class="ml-2">{{ m.mode === 'doubles' ? '雙打' : '單打' }}</span>
            <span class="ml-auto flex gap-3">
              <button class="text-teal-700 hover:underline" @click="startEdit(m)">修改比分</button>
              <button class="text-red-400 hover:text-red-600" @click="onDelete(m)">刪除</button>
            </span>
          </div>
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="flex flex-wrap justify-end gap-1">
              <PlayerChip
                v-for="id in m.teamA"
                :key="id"
                :name="player(id)?.name ?? '?'"
                :color="player(id)?.color ?? '#888'"
                small
              />
            </div>
            <div class="text-center text-lg font-bold tabular-nums" :class="m.scoreA > m.scoreB ? '' : ''">
              <template v-if="editing === m.id">
                <input v-model="editA" type="number" min="0" class="w-14 rounded border border-slate-300 text-center" aria-label="A 隊得分" />
                :
                <input v-model="editB" type="number" min="0" class="w-14 rounded border border-slate-300 text-center" aria-label="B 隊得分" />
              </template>
              <template v-else>
                <span :class="m.scoreA > m.scoreB ? 'text-teal-700' : 'text-slate-500'">{{ m.scoreA }}</span>
                :
                <span :class="m.scoreB > m.scoreA ? 'text-teal-700' : 'text-slate-500'">{{ m.scoreB }}</span>
              </template>
            </div>
            <div class="flex flex-wrap gap-1">
              <PlayerChip
                v-for="id in m.teamB"
                :key="id"
                :name="player(id)?.name ?? '?'"
                :color="player(id)?.color ?? '#888'"
                small
              />
            </div>
          </div>
          <div v-if="editing === m.id" class="mt-2 flex items-center justify-end gap-2">
            <span v-if="error" class="text-xs text-red-600">{{ error }}</span>
            <button class="rounded border border-slate-300 px-3 py-1 text-xs" @click="editing = null">
              取消
            </button>
            <button class="rounded bg-teal-700 px-3 py-1 text-xs text-white" @click="saveEdit(m)">
              儲存並重算
            </button>
          </div>
          <p v-if="m.resters.length" class="mt-1.5 text-xs text-slate-400">
            休息：{{ m.resters.map((id) => player(id)?.name ?? '?').join('、') }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
