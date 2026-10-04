import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { ServerUploadTask, UploadChunk } from '../types/uploads'
import { createUploadQueue, resumeChunkSize, uploadPercent } from './uploadQueue'

const digest = 'd41d8cd98f00b204e9800998ecf8427e'
const serverId = 'task000001'
function server(overrides: Partial<ServerUploadTask> = {}): ServerUploadTask {
  return { fileId: serverId, fileName: 'file.txt', filePid: '0', fileMd5: digest, chunks: 3, state: 'uploading', uploadStatus: null, receivedChunks: [{ index: 0, size: 4 }], receivedCount: 1, receivedBytes: 4, temporaryBytes: 4, fileSize: null, fileAvailable: false, createdAt: 1, updatedAt: 2, expiresAt: 3, ...overrides }
}
function setup() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const api = {
    list: vi.fn().mockResolvedValue({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 }),
    detail: vi.fn().mockResolvedValue(server()),
    cancel: vi.fn().mockResolvedValue(server({ state: 'cancelled', temporaryBytes: 0 })),
    sendChunk: vi.fn().mockImplementation(async (chunk: UploadChunk) => ({ fileId: serverId, status: chunk.chunkIndex === chunk.chunks - 1 ? 'upload_finish' : 'uploading' })),
  }
  const hash = vi.fn().mockResolvedValue(digest)
  const completed = vi.fn()
  const queue = createUploadQueue({ api, hash, completed, storage, chunkSize: 4 })
  queue.setOwner('owner1')
  return { queue, api, hash, completed, values }
}
const file = () => new File(['0123456789'], 'file.txt')
function hangingChunk(_chunk: UploadChunk, signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('paused', 'AbortError')), { once: true }))
}

describe('上传队列与续传', () => {
  it('先计算全文件摘要，首片不自选ID，后续沿用服务端ID并按真实分片边界发送', async () => {
    const { queue, api, hash, completed } = setup()
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    expect(hash).toHaveBeenCalledTimes(1)
    expect(api.sendChunk.mock.calls.map(call => call[0].chunkIndex)).toEqual([0, 1, 2])
    expect(api.sendChunk.mock.calls.map(call => call[0].blob.size)).toEqual([4, 4, 2])
    expect(api.sendChunk.mock.calls[0]![0]).toMatchObject({ fileId: undefined, chunks: 3, fileMd5: digest, filePid: '0' })
    expect(api.sendChunk.mock.calls[1]![0].fileId).toBe(serverId)
    expect(queue.tasks[0]!.state).toBe('completed')
    expect(uploadPercent(queue.tasks[0]!)).toBe(100)
    expect(completed).toHaveBeenCalledTimes(1)
  })

  it('最后编号收到uploading不能虚报成功，重试通过服务端完成回执确认', async () => {
    const { queue, api, completed } = setup()
    api.sendChunk.mockResolvedValue({ fileId: serverId, status: 'uploading' })
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    expect(queue.tasks[0]!.state).toBe('error')
    expect(uploadPercent(queue.tasks[0]!)).toBe(99)
    expect(completed).not.toHaveBeenCalled()
    api.detail.mockResolvedValue(server({ state: 'completed', uploadStatus: 'upload_finish', fileAvailable: true, fileSize: 10 }))
    queue.resume(queue.tasks[0]!.localId)
    await flushPromises()
    expect(queue.tasks[0]!.state).toBe('completed')
    expect(api.sendChunk).toHaveBeenCalledTimes(3)
  })

  it('暂停中止当前请求，继续时以服务器已接受分片为准跳过确认的片', async () => {
    const { queue, api } = setup()
    api.sendChunk.mockResolvedValueOnce({ fileId: serverId, status: 'uploading' }).mockImplementationOnce(hangingChunk)
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    const task = queue.tasks[0]!
    queue.pause(task.localId)
    await flushPromises()
    expect(task.state).toBe('paused')
    api.detail.mockResolvedValue(server({ receivedChunks: [{ index: 0, size: 4 }, { index: 1, size: 4 }], receivedCount: 2, receivedBytes: 8 }))
    queue.resume(task.localId)
    await flushPromises()
    expect(api.sendChunk.mock.calls.map(call => call[0].chunkIndex)).toEqual([0, 1, 2])
    expect(task.state).toBe('completed')
  })

  it('首片结果不确定时禁止无ID盲重试，可从服务器记录重新绑定并续传', async () => {
    const { queue, api } = setup()
    api.sendChunk.mockRejectedValueOnce(new ApiError('网络断开', 0))
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    const task = queue.tasks[0]!
    expect(task.uncertain).toBe(true)
    queue.resume(task.localId)
    expect(api.sendChunk).toHaveBeenCalledTimes(1)
    await expect(queue.cancel(task.localId)).rejects.toThrow('无法保证释放服务器空间')
    expect(task.state).not.toBe('cancelled')
    await queue.resumeServer(server(), file(), '0')
    await flushPromises()
    expect(queue.tasks).toHaveLength(1)
    expect(queue.tasks[0]!.state).toBe('completed')
    expect(api.sendChunk.mock.calls.slice(1).map(call => call[0].chunkIndex)).toEqual([1, 2])
  })

  it('刷新后续传重算完整MD5，拒绝不同名称、目录、大小或校验值', async () => {
    const { queue, api, hash } = setup()
    await expect(queue.resumeServer(server(), new File(['0123456789'], 'different.txt'), '0')).rejects.toThrow('名称或上传目录')
    await expect(queue.resumeServer(server(), file(), 'different')).rejects.toThrow('名称或上传目录')
    hash.mockResolvedValue('different-md5')
    await queue.resumeServer(server(), file(), '0')
    await flushPromises()
    expect(queue.tasks[0]!.state).toBe('error')
    expect(queue.tasks[0]!.error).toContain('完整校验值不匹配')
    expect(api.sendChunk).not.toHaveBeenCalled()
    expect(() => resumeChunkSize(server({ receivedChunks: [{ index: 0, size: 4 }, { index: 2, size: 2 }] }), new File(['short'], 'file.txt'))).toThrow('大小或分片数量')
  })

  it('没有边界记录的空任务不能猜测分片大小，取消后才重新上传', () => {
    expect(() => resumeChunkSize(server({ receivedChunks: [] }), file())).toThrow('无法确认原分片大小')
  })

  it('取消只有服务器确认后生效，失败不显示已取消', async () => {
    const { queue, api } = setup()
    api.sendChunk.mockResolvedValueOnce({ fileId: serverId, status: 'uploading' }).mockImplementationOnce(hangingChunk)
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    api.cancel.mockRejectedValueOnce(new ApiError('取消网络失败', 0))
    await expect(queue.cancel(queue.tasks[0]!.localId)).rejects.toThrow('取消网络失败')
    expect(queue.tasks[0]!.state).toBe('error')
    await queue.cancel(queue.tasks[0]!.localId)
    expect(queue.tasks[0]!.state).toBe('cancelled')
    expect(api.cancel).toHaveBeenCalledWith(serverId)
  })

  it('空文件只上传一片，秒传只凭服务端确认即完成', async () => {
    const { queue, api, completed } = setup()
    api.sendChunk.mockResolvedValue({ fileId: serverId, status: 'upload_seconds' })
    queue.add([new File([], 'empty.txt')], '0', '全部文件')
    await flushPromises()
    expect(api.sendChunk).toHaveBeenCalledTimes(1)
    expect(api.sendChunk.mock.calls[0]![0]).toMatchObject({ chunks: 1, chunkIndex: 0 })
    expect(api.sendChunk.mock.calls[0]![0].blob.size).toBe(0)
    expect(queue.tasks[0]!.uploadStatus).toBe('upload_seconds')
    expect(completed).toHaveBeenCalledTimes(1)
  })

  it('全部分片已接受但合并未完成时幂等重发末片，不重复新建', async () => {
    const { queue, api } = setup()
    api.detail.mockResolvedValue(server({ receivedChunks: [{ index: 0, size: 4 }, { index: 1, size: 4 }, { index: 2, size: 2 }] }))
    await queue.resumeServer(server(), file(), '0')
    await flushPromises()
    expect(api.sendChunk).toHaveBeenCalledTimes(1)
    expect(api.sendChunk.mock.calls[0]![0]).toMatchObject({ fileId: serverId, chunkIndex: 2 })
    expect(queue.tasks[0]!.state).toBe('completed')
  })

  it('退出或更换账号停止上传并清空本地身份下队列', async () => {
    const { queue, api, completed } = setup()
    api.sendChunk.mockImplementationOnce(hangingChunk)
    queue.add([file(), new File(['next'], 'next.txt')], '0', '全部文件')
    await flushPromises()
    queue.setOwner('owner2')
    await flushPromises()
    expect(queue.tasks).toHaveLength(0)
    expect(api.sendChunk).toHaveBeenCalledTimes(1)
    expect(completed).not.toHaveBeenCalled()
  })

  it('账号变化同时中止摘要计算，不将前一账号的File上传到新账号', async () => {
    const { queue, api, hash } = setup()
    let hashingSignal!: AbortSignal
    hash.mockImplementation((_file: Blob, signal: AbortSignal) => {
      hashingSignal = signal
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('paused', 'AbortError'))))
    })
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    expect(queue.tasks[0]!.state).toBe('hashing')
    queue.setOwner('')
    queue.setOwner('owner2')
    await flushPromises()
    expect(hashingSignal.aborted).toBe(true)
    expect(queue.tasks).toHaveLength(0)
    expect(api.sendChunk).not.toHaveBeenCalled()
  })

  it('续传元数据按账号隔离，退出保留远端恢复线索而不带走File对象', async () => {
    const { queue, api, values } = setup()
    api.sendChunk.mockResolvedValueOnce({ fileId: serverId, status: 'uploading' }).mockImplementationOnce(hangingChunk)
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    expect(values.has(`netdisk.upload.owner1.${serverId}`)).toBe(true)
    queue.setOwner('owner2')
    await flushPromises()
    expect(values.has(`netdisk.upload.owner2.${serverId}`)).toBe(false)
    expect(queue.tasks).toHaveLength(0)
  })

  it('旧身份迟迟未结束的请求不阻塞新账号的新任务，也不回填旧结果', async () => {
    const { queue, api } = setup()
    let finishOld!: (reply: { fileId: string; status: string }) => void
    api.sendChunk.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    queue.add([file()], '0', '全部文件')
    await flushPromises()
    queue.setOwner('owner2')
    queue.add([new File(['new'], 'new.txt')], '0', '全部文件')
    await flushPromises()
    expect(queue.tasks).toHaveLength(1)
    expect(queue.tasks[0]!.fileName).toBe('new.txt')
    expect(queue.tasks[0]!.state).toBe('completed')
    finishOld({ fileId: 'oldtask001', status: 'upload_finish' })
    await flushPromises()
    expect(queue.tasks).toHaveLength(1)
  })
})
