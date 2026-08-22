import { describe, expect, it } from 'vitest'
import { AuditedJ1Lifecycle, InMemoryJ1RetentionStore } from '../causal'

const view = {
  eventId: 'causal-1', activityId: 0, gameIndex: 0, completedAtMinute: 100,
  activityAttendees: [0, 1, 2, 3], teamA: [0, 1] as [number, number], teamB: [2, 3] as [number, number],
  targetPoints: 15, winBy: 2, capPoints: 21,
}

describe('AuditedJ1Lifecycle', () => {
  it('rejects outcome-bearing objects before copying the score-free view', () => {
    const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 })
    expect(() => lifecycle.prepare({ ...view, scoreA: 15, scoreB: 10 } as typeof view)).toThrow(/score-free/)
    expect(lifecycle.snapshot().version).toBe(0)
  })

  it('only commits an exact retained receipt once', () => {
    const store = new InMemoryJ1RetentionStore()
    const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, store)
    const receipt = lifecycle.retain(lifecycle.prepare(view))
    const before = lifecycle.snapshot()
    expect(() => lifecycle.commit({ ...view, scoreA: 15, scoreB: 10 }, { ...receipt })).toThrow(/retained/)
    expect(lifecycle.snapshot()).toEqual(before)
    lifecycle.commit({ ...view, scoreA: 15, scoreB: 10 }, receipt)
    const after = lifecycle.snapshot()
    expect(after.version).toBe(1)
    expect(() => lifecycle.commit({ ...view, scoreA: 15, scoreB: 10 }, receipt)).toThrow(/retained/)
    expect(lifecycle.snapshot()).toEqual(after)
  })

  it('requires retention before outcome and rejects foreign store receipts without state change', () => {
    const leftStore = new InMemoryJ1RetentionStore()
    const left = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, leftStore)
    const token = left.prepare(view)
    const before = left.snapshot()
    expect(() => left.commit({ ...view, scoreA: 15, scoreB: 10 }, token)).toThrow(/retained/)
    expect(left.snapshot()).toEqual(before)
    const foreign = new InMemoryJ1RetentionStore()
    const receipt = foreign.retain('J1-CT-96', view, token)
    expect(() => left.commit({ ...view, scoreA: 15, scoreB: 10 }, receipt)).toThrow(/retained/)
    expect(left.snapshot()).toEqual(before)
  })

  it('does not retain or advance the watermark when persistence fails, and permits retrying the same pending preparation', () => {
    let attempts = 0
    const store = new InMemoryJ1RetentionStore(() => { if (attempts++ === 0) throw new Error('disk unavailable') })
    const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, store)
    const token = lifecycle.prepare(view)
    expect(() => lifecycle.retain(token)).toThrow(/disk unavailable/)
    expect(store.watermark('J1-CT-96')).toBeUndefined()
    expect(lifecycle.snapshot().version).toBe(0)
    expect(() => lifecycle.retain(token)).not.toThrow()
  })

  it('consumes a retained identity on an illegal endpoint after receipt verification without scientific mutation', () => {
    const store = new InMemoryJ1RetentionStore()
    const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, store)
    const receipt = lifecycle.retain(lifecycle.prepare(view))
    const before = lifecycle.snapshot()
    expect(() => lifecycle.commit({ ...view, scoreA: 21, scoreB: 18 }, receipt)).toThrow(/legal/)
    expect(lifecycle.snapshot()).toEqual(before)
    expect(() => lifecycle.commit({ ...view, scoreA: 15, scoreB: 10 }, receipt)).toThrow(/retained/)
    const nextView = { ...view, eventId: 'causal-2', gameIndex: 1, completedAtMinute: 120 }
    const nextReceipt = lifecycle.retain(lifecycle.prepare(nextView))
    expect(() => lifecycle.commit({ ...nextView, scoreA: 15, scoreB: 10 }, nextReceipt)).not.toThrow()
  })

  it('binds TS-native prestate evidence to canonical roster order', () => {
    const left = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 })
    const right = new AuditedJ1Lifecycle([1, 0, 2, 3], { sigma: 0.035 })
    const leftReceipt = left.retain(left.prepare(view))
    const rightReceipt = right.retain(right.prepare(view))
    expect(leftReceipt.prestateEvidenceDigest).not.toBe(rightReceipt.prestateEvidenceDigest)
  })

  it('fails closed on persistence callback reentrancy without a watermark', () => {
    let store: InMemoryJ1RetentionStore
    let token: ReturnType<AuditedJ1Lifecycle['prepare']>
    store = new InMemoryJ1RetentionStore(() => { store.retain('J1-CT-96', view, token) })
    const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 }, store)
    token = lifecycle.prepare(view)
    expect(() => lifecycle.retain(token)).toThrow(/reentrancy/)
    expect(store.watermark('J1-CT-96')).toBeUndefined()
    expect(lifecycle.snapshot().version).toBe(0)
  })

  it('defensively copies the complete scheduled identity', () => {
    const lifecycle = new AuditedJ1Lifecycle([0, 1, 2, 3], { sigma: 0.035 })
    const mutable = { ...view, activityAttendees: [...view.activityAttendees], teamA: [...view.teamA] as [number, number] }
    const token = lifecycle.prepare(mutable)
    const receipt = lifecycle.retain(token)
    mutable.teamA[0] = 99
    mutable.activityAttendees[0] = 99
    expect(() => lifecycle.commit({ ...view, scoreA: 15, scoreB: 10 }, receipt)).not.toThrow()
  })
})
