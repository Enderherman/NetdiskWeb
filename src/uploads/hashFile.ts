export function hashFile(file: Blob, signal: AbortSignal, progress: (ratio: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('已暂停', 'AbortError')); return }
    const worker = new Worker(new URL('./md5.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new DOMException('已暂停', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: number; digest?: string; message?: string }>) => {
      if (event.data.type === 'progress') progress(event.data.progress || 0)
      if (event.data.type === 'complete') { cleanup(); resolve(event.data.digest!) }
      if (event.data.type === 'error') { cleanup(); reject(new Error(event.data.message)) }
    }
    worker.onerror = () => { cleanup(); reject(new Error('文件校验失败，请确认浏览器允许 Worker 后重试')) }
    worker.postMessage(file)
  })
}
