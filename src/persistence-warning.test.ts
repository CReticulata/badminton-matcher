import { createSSRApp, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { data, persistData, persistenceError } from './store'

afterEach(() => {
  data.players.splice(0)
  persistenceError.value = null
  vi.unstubAllGlobals()
})

describe('本機資料持久化警告', () => {
  it('沒有 localStorage 的 SSR 環境不產生假警告', async () => {
    vi.stubGlobal('localStorage', undefined)

    expect(persistData()).toBe(true)
    expect(await renderToString(createSSRApp(App))).not.toContain('資料尚未儲存到此裝置')
  })

  it('localStorage 寫入失敗時顯示全域警告，成功後清除', async () => {
    let shouldThrow = true
    const setItem = vi.fn((_key: string, _value: string): void => {
      if (shouldThrow) throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    vi.stubGlobal('localStorage', { setItem })

    data.players.push({
      id: 'p1', name: '小明', color: '#ef4444', rating: 1500,
      rd: 350, vol: 0.06, initialRating: 1500, createdAt: 1,
    })
    await nextTick()
    expect(setItem).toHaveBeenCalled()
    expect(persistenceError.value).not.toBeNull()
    expect(await renderToString(createSSRApp(App))).toContain('資料尚未儲存到此裝置')

    shouldThrow = false
    data.players[0]!.name = '阿明'
    await nextTick()
    expect(persistenceError.value).toBeNull()
  })
})
