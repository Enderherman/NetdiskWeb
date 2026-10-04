import { hashBlob } from './md5Algorithm'

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const digest = await hashBlob(event.data, progress => self.postMessage({ type: 'progress', progress }))
    self.postMessage({ type: 'complete', digest })
  } catch { self.postMessage({ type: 'error', message: '无法读取本地文件，请重新选择后重试' }) }
}
