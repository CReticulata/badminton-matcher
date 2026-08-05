import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

// 最簡 PWA：production 才註冊 service worker（快取靜態資源、支援離線）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 註冊失敗不影響使用 */
    })
  })
}
