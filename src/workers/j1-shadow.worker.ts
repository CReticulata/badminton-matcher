import { handleShadowMessage } from '../lib/rating-j1/worker-handler'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  self.postMessage(handleShadowMessage(event.data))
})
