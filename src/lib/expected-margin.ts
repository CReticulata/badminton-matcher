/**
 * 預期分差：把兩隊的 rating 差換算成「這場大概會贏幾分」。
 *
 * 僅供顯示。分組選擇不得依賴本模組——預期分差對 rating 差單調遞增，
 * 拿來當目標函數會選出完全相同的分隊（no-op），卻替核心分組路徑加上一個
 * 係數、一個賽制相依性，以及未知賽制的失敗模式。
 *
 * 模型：每球獨立，強隊以機率 q = sigmoid(BETA * 平均 rating 差 / 100) 得分，
 * 終局比分分布由賽制規則的動態規劃求得。
 */
import {
  isStructured,
  type ScoringFormatSnapshot,
  type StructuredScoringFormat,
} from './scoring-format'

/**
 * 每 100 rating 點對應的每球勝率 logit。
 *
 * 以 2026-08-26 匯出的 29 場實際紀錄擬合，95% CI [0.0955, 0.4239]，
 * 對 beta = 0 的概似比檢定 p = 0.0015。CI 寬達 4.4 倍，因此本數值只用於
 * 粗略說明，不得呈現為預測比分。來源：
 * docs/research/score-aware-margin-calibration.md
 */
export const BETA = 0.2552
export const BETA_CI: readonly [number, number] = [0.0955, 0.4239]
export const BETA_SAMPLE_SIZE = 29

function sigmoid(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))
}

/** 終局比分的三個互斥分支，與 scoring-format 的 isLegalEndpoint 一致 */
function isTerminal(a: number, b: number, target: number, winBy: number, cap: number): boolean {
  if (a === b) return false
  const winner = Math.max(a, b)
  const loser = Math.min(a, b)
  if (winner === target) return loser <= target - winBy
  if (winner > target && winner < cap) return winner - loser === winBy
  if (cap > target && winner === cap) return loser >= cap - winBy && loser < cap
  return false
}

/** 逐球 iid 假設下的預期絕對分差 */
function meanMargin(q: number, format: StructuredScoringFormat): number {
  const { target, winBy, cap } = format.rules
  // states[a * (cap + 1) + b] = 到達該比分且尚未結束的機率
  const width = cap + 1
  const states = new Float64Array(width * width)
  states[0] = 1
  let total = 0
  let expected = 0
  for (let sum = 0; sum <= 2 * cap; sum++) {
    for (let a = Math.max(0, sum - cap); a <= Math.min(cap, sum); a++) {
      const b = sum - a
      const mass = states[a * width + b]!
      if (mass === 0) continue
      if (isTerminal(a, b, target, winBy, cap)) {
        total += mass
        expected += mass * Math.abs(a - b)
        continue
      }
      if (a + 1 <= cap) states[(a + 1) * width + b]! += mass * q
      if (b + 1 <= cap) states[a * width + b + 1]! += mass * (1 - q)
    }
  }
  // 規則保證每條路徑都會終止；殘留質量代表規則有誤
  if (!(total > 0.999999)) throw new Error('賽制規則無法保證比賽結束')
  return expected / total
}

const cache = new Map<string, number>()

/**
 * 平均 rating 差對應的預期絕對分差。
 *
 * @param meanRatingGap 兩隊「平均」rating 之差（雙打不是總和差）。
 * @returns 預期分差；賽制未知時回傳 null，不得以預設賽制代替。
 */
export function expectedMargin(
  meanRatingGap: number,
  format: ScoringFormatSnapshot,
): number | null {
  if (!isStructured(format)) return null
  if (!Number.isFinite(meanRatingGap)) return null
  const q = sigmoid((BETA * Math.abs(meanRatingGap)) / 100)
  const { target, winBy, cap } = format.rules
  const key = `${target}/${winBy}/${cap}/${q.toFixed(6)}`
  let value = cache.get(key)
  if (value === undefined) {
    value = meanMargin(q, format)
    cache.set(key, value)
  }
  return value
}

export type BalanceBand = 'even' | 'slight' | 'noticeable' | 'lopsided'

/** 依預期分差分成四段；門檻以羽球分數表達，可被人直接理解 */
export function balanceBand(margin: number): BalanceBand {
  if (margin < 5) return 'even'
  if (margin < 6.5) return 'slight'
  if (margin < 8) return 'noticeable'
  return 'lopsided'
}

const BAND_LABEL: Record<BalanceBand, string> = {
  even: '勢均力敵',
  slight: '略有差距',
  noticeable: '差距明顯',
  lopsided: '差距很大',
}

/**
 * 供人閱讀的粗略說明。刻意不給預測比分或勝率——beta 的 CI 寬達 4.4 倍，
 * 給出具體比分會被當成資料支持不了的預測。
 */
export function describeBalance(
  meanRatingGap: number,
  format: ScoringFormatSnapshot,
): string | null {
  const margin = expectedMargin(meanRatingGap, format)
  if (margin === null) return null
  return `${BAND_LABEL[balanceBand(margin)]}・預期分差約 ${Math.round(margin)} 分`
}
