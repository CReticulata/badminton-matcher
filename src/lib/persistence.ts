/**
 * localStorage 載入邊界。
 *
 * 舊行為是 JSON.parse 失敗就回傳空資料，接著 deep watcher 會把空資料寫回去，
 * 覆蓋掉使用者真正的紀錄。這裡改成 fail closed：讀不懂就保留原始值、封鎖寫入，
 * 交由復原流程處理。
 */
import type { AppData } from '../types'
import { normalizeAppData } from './app-data-normalization'
import { migrateAppData } from './migration'

export const STORAGE_KEY = 'badminton-matcher:v1'
/** 首次寫入含賽制欄位的資料前，一次性保存的舊格式原始值 */
export const BACKUP_KEY = 'badminton-matcher:pre-scoring-format-v1'

export type LoadOutcome =
  | { status: 'ready'; data: AppData; raw: string | null; migrated: boolean }
  | { status: 'blocked'; raw: string; message: string }

const emptyData = (): AppData => ({
  players: [], sessions: [], matches: [], overrides: [], baselines: [],
})

export function loadPersisted(storage: Storage | undefined): LoadOutcome {
  if (!storage) return { status: 'ready', data: emptyData(), raw: null, migrated: false }

  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { status: 'ready', data: emptyData(), raw: null, migrated: false }
  }
  if (raw === null || raw === '') return { status: 'ready', data: emptyData(), raw: null, migrated: false }

  try {
    const parsed = JSON.parse(raw)
    const before = JSON.stringify(parsed)
    const data = migrateAppData(normalizeAppData(parsed))
    return { status: 'ready', data, raw, migrated: JSON.stringify(data) !== before }
  } catch (error) {
    return { status: 'blocked', raw, message: (error as Error).message || '資料格式無法辨識' }
  }
}

/**
 * 確保舊格式原始值已備份。備份具冪等性、不覆寫既有備份，且必須逐字回讀成功。
 * 回傳 false 代表不得寫入加料後的資料。
 */
export function ensurePreFormatBackup(storage: Storage | undefined, raw: string | null): boolean {
  if (!storage) return true
  if (raw === null || raw === '') return true
  try {
    if (storage.getItem(BACKUP_KEY) !== null) return true
    storage.setItem(BACKUP_KEY, raw)
    return storage.getItem(BACKUP_KEY) === raw
  } catch {
    return false
  }
}
