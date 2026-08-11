<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  clearAllHistory,
  clearSession,
  data,
  deleteMatch,
  downloadCsvBackup,
  editMatchScore,
  latestBaselineAt,
  playerById,
  ratingReportsBySession,
} from '../store'
import PlayerChip from './PlayerChip.vue'
import type { Match, Session } from '../types'

const editing = ref<string | null>(null)
const editA = ref('')
const editB = ref('')
const error = ref('')
const expandedSessions = ref<Set<string>>(new Set())

// ---------- 清除歷史紀錄 ----------

type ClearTarget = { type: 'session'; sessionId: string } | { type: 'all' }

const clearTarget = ref<ClearTarget | null>(null)
const resetRatings = ref(false)

/** 目前 modal 對象的摘要：N（實際會刪除的場次數）、是否波及進行中場次 */
const clearInfo = computed(() => {
  const t = clearTarget.value
  if (!t) return null
  if (t.type === 'session') {
    const g = groups.value.find((x) => x.sessionId === t.sessionId)
    return { count: g?.matches.length ?? 0, hasActive: g?.session?.active === true }
  }
  const hasActive = groups.value.some((x) => x.session?.active === true)
  return { count: data.matches.length, hasActive }
})

function openClearSession(sessionId: string) {
  resetRatings.value = false
  clearTarget.value = { type: 'session', sessionId }
}

function openClearAll() {
  resetRatings.value = false
  clearTarget.value = { type: 'all' }
}

function closeClearModal() {
  clearTarget.value = null
}

function confirmClear() {
  const t = clearTarget.value
  if (!t) return
  if (t.type === 'session') {
    clearSession(t.sessionId, resetRatings.value)
  } else {
    clearAllHistory(resetRatings.value)
  }
  clearTarget.value = null
}

/** 依場次分群（新→舊） */
const groups = computed(() => {
  const bySession = new Map<string, Match[]>()
  for (const session of data.sessions) bySession.set(session.id, [])
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

/** 早於最新固化基準的比賽：紀錄可改，但不再影響強度分數 */
const beforeBaseline = (m: Match) => m.at < latestBaselineAt.value

const player = (id: string) => playerById.value.get(id)
const report = (sessionId: string) => ratingReportsBySession.value.get(sessionId)
const matchDelta = (sessionId: string, matchId: string, playerId: string) =>
  report(sessionId)?.matchChanges.get(matchId)?.[playerId]
const formatDelta = (delta: number) =>
  delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '±0'
const toggleSummary = (sessionId: string) => {
  const next = new Set(expandedSessions.value)
  if (next.has(sessionId)) next.delete(sessionId)
  else next.add(sessionId)
  expandedSessions.value = next
}
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
    <p class="mb-4 text-sm text-slate-500">修改或刪除後，會從該活動的固定開場狀態重新計算</p>

    <p v-if="groups.length === 0" class="py-10 text-center text-sm text-slate-500">還沒有比賽紀錄</p>

    <section v-for="g in groups" :key="g.sessionId" class="mb-6">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-600">
          {{ g.session?.name ?? '（未知場次）' }}
        </h3>
        <div class="flex items-center gap-3">
          <button
            v-if="g.session && !g.session.active && report(g.sessionId)"
            class="text-xs font-medium text-teal-700 hover:underline"
            @click="toggleSummary(g.sessionId)"
          >
            {{ expandedSessions.has(g.sessionId) ? '收合活動摘要' : '查看活動摘要' }}
          </button>
          <button
            class="text-xs text-red-500 hover:text-red-700 hover:underline"
            @click="openClearSession(g.sessionId)"
          >
            清除此場次
          </button>
        </div>
      </div>
      <div
        v-if="expandedSessions.has(g.sessionId) && report(g.sessionId)"
        class="mb-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3"
      >
        <div class="mb-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[11px] text-slate-500">
          <span>參賽者</span><span>開場分數</span><span>結束分數</span><span>整日變動</span>
        </div>
        <div
          v-for="row in report(g.sessionId)!.summary"
          :key="row.playerId"
          class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-t border-teal-100 py-2 text-sm"
        >
          <span class="min-w-0 font-medium text-slate-700">
            {{ player(row.playerId)?.name ?? '?' }}
            <span v-if="row.addedDuringSession" class="ml-1 text-[10px] text-teal-700">活動中新增</span>
          </span>
          <span class="tabular-nums text-slate-500">{{ row.openingRating }}</span>
          <span class="tabular-nums text-slate-700">{{ row.endingRating }}</span>
          <span
            class="min-w-10 text-right font-semibold tabular-nums"
            :class="row.delta > 0 ? 'text-teal-700' : row.delta < 0 ? 'text-red-500' : 'text-slate-400'"
          >{{ formatDelta(row.delta) }}</span>
        </div>
      </div>
      <p v-if="g.matches.length === 0" class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
        沒有完成的比賽
      </p>
      <ul class="space-y-2">
        <li
          v-for="m in g.matches"
          :key="m.id"
          class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div class="mb-1 flex items-center text-xs text-slate-400">
            <span>{{ time(m.at) }}</span>
            <span class="ml-2">{{ m.mode === 'doubles' ? '雙打' : '單打' }}</span>
            <span
              v-if="beforeBaseline(m)"
              class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500"
              title="此紀錄早於強度基準點（清除歷史時固化），修改或刪除不會改變強度分數"
            >
              已結算
            </span>
            <span class="ml-auto flex gap-3">
              <button class="text-teal-700 hover:underline" @click="startEdit(m)">修改比分</button>
              <button class="text-red-400 hover:text-red-600" @click="onDelete(m)">刪除</button>
            </span>
          </div>
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="flex flex-wrap justify-end gap-1">
              <div
                v-for="id in m.teamA"
                :key="id"
                class="flex flex-col items-center gap-0.5"
              >
                <span
                  v-if="matchDelta(g.sessionId, m.id, id) !== undefined"
                  class="text-[10px] font-semibold tabular-nums text-slate-500"
                >
                  {{ formatDelta(matchDelta(g.sessionId, m.id, id)!) }}
                </span>
                <PlayerChip :name="player(id)?.name ?? '?'" :color="player(id)?.color ?? '#888'" small />
              </div>
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
              <div
                v-for="id in m.teamB"
                :key="id"
                class="flex flex-col items-center gap-0.5"
              >
                <span
                  v-if="matchDelta(g.sessionId, m.id, id) !== undefined"
                  class="text-[10px] font-semibold tabular-nums text-slate-500"
                >
                  {{ formatDelta(matchDelta(g.sessionId, m.id, id)!) }}
                </span>
                <PlayerChip :name="player(id)?.name ?? '?'" :color="player(id)?.color ?? '#888'" small />
              </div>
            </div>
          </div>
          <div v-if="editing === m.id" class="mt-2 flex items-center justify-end gap-2">
            <span v-if="beforeBaseline(m)" class="mr-auto text-xs text-amber-600">
              早於強度基準點，僅更新紀錄、不影響強度分數
            </span>
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

    <div class="mt-16 border-t border-slate-200 pt-6 text-center">
      <p class="mb-2 text-xs text-slate-400">危險操作區：以下操作將永久刪除歷史紀錄</p>
      <button
        class="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        @click="openClearAll"
      >
        清除全部歷史
      </button>
    </div>

    <!-- 清除歷史紀錄確認 modal -->
    <div
      v-if="clearTarget && clearInfo"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeClearModal"
    >
      <div class="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h3 class="mb-3 text-base font-bold text-slate-800">確認清除歷史紀錄</h3>
        <p class="mb-1 text-sm text-slate-700">將刪除 {{ clearInfo.count }} 場紀錄</p>
        <p class="mb-3 text-sm font-semibold text-red-600">此動作無法復原</p>
        <p v-if="clearInfo.hasActive" class="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-700">
          今日上場／休息統計將歸零，影響後續輪替安排
        </p>

        <button
          class="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          @click="downloadCsvBackup"
        >
          先匯出 CSV 備份
        </button>

        <label class="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input v-model="resetRatings" type="checkbox" />
          同時重設相關球員的強度分數
        </label>

        <div class="flex justify-end gap-2">
          <button
            class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            @click="closeClearModal"
          >
            取消
          </button>
          <button
            class="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            @click="confirmClear"
          >
            確認清除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
