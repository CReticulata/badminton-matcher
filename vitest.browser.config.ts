import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: { include: ['vue'] },
  test: { browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }] }, include: ['src/**/*-browser.test.ts'], testTimeout: 90000 },
})
