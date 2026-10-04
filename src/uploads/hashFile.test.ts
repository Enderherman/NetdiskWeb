import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashFile } from './hashFile'

class FakeWorker {
  static last: FakeWorker
  onmessage: ((event: { data: object }) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { FakeWorker.last = this }
}
afterEach(() => vi.unstubAllGlobals())
describe('摘要Worker生命周期', () => {
  it('暂停或退出时中止Worker，避免后台继续计算', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const controller = new AbortController()
    const result = hashFile(new File(['abc'], 'a.txt'), controller.signal, vi.fn())
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejection
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1)
  })
  it('进度与完成通过消息返回，结束后释放Worker', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const progress = vi.fn()
    const result = hashFile(new File(['abc'], 'a.txt'), new AbortController().signal, progress)
    FakeWorker.last.onmessage!({ data: { type: 'progress', progress: .5 } })
    FakeWorker.last.onmessage!({ data: { type: 'complete', digest: '900150983cd24fb0d6963f7d28e17f72' } })
    expect(await result).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(progress).toHaveBeenCalledWith(.5)
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1)
  })
})
