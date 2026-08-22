import { isLegalEndpoint } from './endpoint'
import { J1Filter, type J1PregameView } from './filter'

export const J1_CT_96_GRID = Object.freeze([0, 0.02, 0.035, 0.055, 0.08, 0.12])
const VALIDATION_START = 96
const VALIDATION_END = 144
const TIE_TOLERANCE = 1e-12
export interface J1SelectorEvent extends J1PregameView { readonly scoreA: number; readonly scoreB: number }
export interface J1SelectorSurfaceRow { readonly sigma: number; readonly validationNll: number }
export interface J1CT96Selection { readonly method: 'J1-CT-96'; readonly sigmaGrid: readonly number[]; readonly validationWindow: readonly [96, 144]; readonly selectedSigma: number; readonly surface: readonly J1SelectorSurfaceRow[] }
export interface J1CT96Options { readonly sigmaGrid?: readonly number[]; readonly validationWindow?: readonly [number, number] }

function exactGrid(grid: readonly number[]): boolean { return grid.length === J1_CT_96_GRID.length && grid.every((value, index) => value === J1_CT_96_GRID[index]) }
function validRoster(roster: readonly number[]): boolean { return roster.length >= 4 && roster.every(Number.isSafeInteger) && new Set(roster).size === roster.length }
function chronological(events: readonly J1SelectorEvent[]): boolean { for (let index = 1; index < events.length; index += 1) { const left = events[index - 1]; const right = events[index]; const a = [left.completedAtMinute, left.activityId, left.gameIndex, left.eventId]; const b = [right.completedAtMinute, right.activityId, right.gameIndex, right.eventId]; for (let item = 0; item < a.length; item += 1) { if (a[item] < b[item]) break; if (a[item] > b[item]) return false; if (item === a.length - 1) return false } } return true }
function validHistory(roster: readonly number[], events: readonly J1SelectorEvent[]): void {
  if (!validRoster(roster)) throw new RangeError('J1-CT-96 requires a fixed unique integer roster of at least four players')
  if (events.length !== 1728 || new Set(events.map((event) => event.eventId)).size !== events.length || events.some((event) => !event.eventId || !Number.isSafeInteger(event.eventId.length))) throw new RangeError('J1-CT-96 requires an exact complete 0..143 x 0..11 history with unique ids')
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]; const activityId = Math.floor(index / 12); const gameIndex = index % 12
    if (event.activityId !== activityId || event.gameIndex !== gameIndex || !event.activityAttendees.every((player) => roster.includes(player)) || !event.teamA.every((player) => roster.includes(player)) || !event.teamB.every((player) => roster.includes(player))) throw new RangeError('J1-CT-96 requires an exact complete 0..143 x 0..11 roster-bound history')
    if (!isLegalEndpoint(event.scoreA, event.scoreB) || event.targetPoints !== 15 || event.winBy !== 2 || event.capPoints !== 21) throw new RangeError('J1-CT-96 requires legal 15/2/21 endpoints')
  }
  if (!chronological(events)) throw new RangeError('J1-CT-96 history must be strictly chronological')
}

function compensatedSum(values: readonly number[]): number {
  const partials: number[] = []
  for (const value of values) {
    if (!Number.isFinite(value)) throw new RangeError('activity losses must be finite')
    let x = value
    let write = 0
    for (const partial of partials) {
      let y = partial
      if (Math.abs(x) < Math.abs(y)) [x, y] = [y, x]
      const high = x + y
      const low = y - (high - x)
      if (low !== 0) partials[write++] = low
      x = high
    }
    partials.length = write
    partials.push(x)
  }
  return partials.reduce((sum, partial) => sum + partial, 0)
}

/** Generic equal-group seam used to prove activity weighting independently of the strict 12-game contract. */
export function aggregateActivityMeans(losses: readonly (readonly number[])[]): number {
  if (losses.length === 0 || losses.some((activity) => activity.length === 0)) throw new RangeError('activity groups must be non-empty')
  const means = losses.map((activity) => compensatedSum(activity) / activity.length)
  return compensatedSum(means) / means.length
}

/** Pure formal aggregation seam: Python-fsum-style game then activity reductions. */
export function aggregateActivityEqualNll(losses: readonly (readonly number[])[]): number {
  if (losses.length !== 48 || losses.some((activity) => activity.length !== 12 || activity.some((loss) => !Number.isFinite(loss)))) throw new RangeError('J1-CT-96 requires 48 activities of 12 finite NLL values')
  return aggregateActivityMeans(losses)
}

/** Complete-prefix seam: activities 0..95 are mandatory state history but never direct loss cells. */
export function aggregateJ1ValidationNll(losses: readonly (readonly number[])[]): number {
  if (losses.length !== 144 || losses.some((activity) => activity.length !== 12)) throw new RangeError('J1-CT-96 requires a complete prefix of 144 activities x 12 games')
  return aggregateActivityEqualNll(losses.slice(VALIDATION_START, VALIDATION_END))
}
/** Pure tie seam; callers must provide finite, ascending unique sigma rows. */
export function selectSmallestWithinTolerance(rows: readonly J1SelectorSurfaceRow[]): number {
  if (rows.length === 0 || rows.some((row, index) => !Number.isFinite(row.sigma) || !Number.isFinite(row.validationNll) || (index > 0 && row.sigma <= rows[index - 1].sigma))) throw new RangeError('selector rows must be finite and strictly increasing')
  const best = Math.min(...rows.map((row) => row.validationNll)); return rows.find((row) => row.validationNll <= best + TIE_TOLERANCE)!.sigma
}

/** Frozen formal J1-CT-96 selector; custom grids/windows have no J1-CT-96 label. */
export function selectJ1CT96(roster: readonly number[], events: readonly J1SelectorEvent[], options: J1CT96Options = {}): J1CT96Selection {
  if ((options.sigmaGrid !== undefined && !exactGrid(options.sigmaGrid)) || (options.validationWindow !== undefined && (options.validationWindow[0] !== VALIDATION_START || options.validationWindow[1] !== VALIDATION_END))) throw new RangeError('J1-CT-96 parameters are frozen; custom selector has no J1-CT-96 label')
  validHistory(roster, events)
  const surface = J1_CT_96_GRID.map((sigma) => {
    const filter = new J1Filter(roster, { sigma, omega: 0.30 }); const validation: number[][] = Array.from({ length: 48 }, () => [])
    for (const event of events) {
      const { scoreA, scoreB, ...view } = event; const token = filter.prepare(view); const prediction = filter.commit(view, token, scoreA, scoreB)
      if (event.activityId >= VALIDATION_START) { if (!Number.isFinite(prediction.endpointNll)) throw new RangeError('J1-CT-96 rejects non-finite endpoint loss'); validation[event.activityId - VALIDATION_START].push(prediction.endpointNll!) }
    }
    return Object.freeze({ sigma, validationNll: aggregateActivityEqualNll(validation) })
  })
  return Object.freeze({ method: 'J1-CT-96', sigmaGrid: J1_CT_96_GRID, validationWindow: [96, 144] as const, selectedSigma: selectSmallestWithinTolerance(surface), surface: Object.freeze(surface) })
}
