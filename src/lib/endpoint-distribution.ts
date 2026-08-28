/**
 * 終局比分的機率分布：逐球獨立假設下，以每球勝率 q 推出各種終局比分的機率。
 *
 * 目前的唯一用途是評分（`glicko2.ts`）：把由觀測比分反推的每球勝率換算成勝率，
 * 取代二元勝負。分組不得依賴本模組——預期分差對 rating 差單調遞增，拿來當分組
 * 目標函數是 no-op，只會替核心路徑加上賽制相依性（有測試鎖住）。
 */
import type { ScoringRules } from './scoring-format'

export interface EndpointStats {
  /** 該局由「每球勝率 q 的一方」獲勝的機率 */
  readonly winProbability: number
  /** 預期的絕對分差 E|a−b|；實力相同時仍為正，因為總得有人贏 */
  readonly meanMargin: number
}

/** 終局判定的三個互斥分支，與 scoring-format 的 isLegalEndpoint 一致 */
function isTerminal(a: number, b: number, rules: ScoringRules): boolean {
  if (a === b) return false
  const { target, winBy, cap } = rules
  const winner = Math.max(a, b)
  const loser = Math.min(a, b)
  if (winner === target) return loser <= target - winBy
  if (winner > target && winner < cap) return winner - loser === winBy
  if (cap > target && winner === cap) return loser >= cap - winBy && loser < cap
  return false
}

function compute(q: number, rules: ScoringRules): EndpointStats {
  if (q >= 1) return { winProbability: 1, meanMargin: rules.target }
  if (q <= 0) return { winProbability: 0, meanMargin: rules.target }

  const { cap } = rules
  const width = cap + 1
  const states = new Float64Array(width * width)
  states[0] = 1
  let total = 0
  let winning = 0
  let margin = 0
  for (let sum = 0; sum <= 2 * cap; sum++) {
    for (let a = Math.max(0, sum - cap); a <= Math.min(cap, sum); a++) {
      const b = sum - a
      const mass = states[a * width + b]!
      if (mass === 0) continue
      if (isTerminal(a, b, rules)) {
        total += mass
        margin += mass * Math.abs(a - b)
        if (a > b) winning += mass
        continue
      }
      if (a + 1 <= cap) states[(a + 1) * width + b]! += mass * q
      if (b + 1 <= cap) states[a * width + b + 1]! += mass * (1 - q)
    }
  }
  // 賽制驗證保證每條路徑都會終止；殘留質量代表規則有誤
  if (!(total > 1 - 1e-9)) throw new Error('賽制規則無法保證比賽結束')
  return { winProbability: winning / total, meanMargin: margin / total }
}

const cache = new Map<string, EndpointStats>()

/**
 * 每球勝率 q 對應的終局統計量。
 *
 * q 以六位小數為快取鍵。實務上 q 來自小整數比值或有限的 rating 差，
 * 相異值很少，快取命中率高。
 */
export function endpointStats(q: number, rules: ScoringRules): EndpointStats {
  if (!Number.isFinite(q)) throw new Error('每球勝率必須是有限數')
  const key = `${rules.target}/${rules.winBy}/${rules.cap}/${q.toFixed(6)}`
  let value = cache.get(key)
  if (value === undefined) {
    value = compute(q, rules)
    cache.set(key, value)
  }
  return value
}
