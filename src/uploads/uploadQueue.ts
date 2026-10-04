import { reactive } from 'vue'
import { uploadsApi } from '../api/uploads'
import { ApiError } from '../api/client'
import { validateFileName } from '../composables/filePresentation'
import { useAccount } from '../composables/account'
import { hashFile } from './hashFile'
import type { LocalUploadTask, ServerUploadTask } from '../types/uploads'

export const FILES_CHANGED_EVENT = 'netdisk:files-changed'
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024
interface SavedUpload { fileSize: number; chunkSize: number; fileName: string; filePid: string; fileMd5: string; chunks: number }
interface QueueDependencies {
  api: typeof uploadsApi
  hash: typeof hashFile
  completed: () => void
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  chunkSize?: number
}

export function resumeChunkSize(task: ServerUploadTask, file: File, saved?: SavedUpload): number {
  if (saved && (saved.fileSize !== file.size || saved.fileName !== task.fileName || saved.filePid !== task.filePid || saved.fileMd5 !== task.fileMd5 || saved.chunks !== task.chunks)) throw new ApiError('文件大小、路径或任务记录不匹配，请重新选择原文件', 600)
  let chunkSize = saved?.chunkSize
  if (!chunkSize) {
    if (!task.receivedChunks.length) throw new ApiError('无法确认原分片大小，请取消此任务后重新上传', 600)
    if (task.chunks === 1) chunkSize = Math.max(1, task.receivedChunks[0]!.size)
    else chunkSize = task.receivedChunks.find(chunk => chunk.index < task.chunks - 1)?.size
  }
  if (!chunkSize || chunkSize < 1 || chunkSize > 100 * 1024 * 1024 || Math.max(1, Math.ceil(file.size / chunkSize)) !== task.chunks) throw new ApiError('原文件大小或分片数量不匹配，不能续传', 600)
  for (const chunk of task.receivedChunks) {
    const expected = Math.max(0, Math.min(chunkSize, file.size - chunk.index * chunkSize))
    if (chunk.index < 0 || chunk.index >= task.chunks || chunk.size !== expected) throw new ApiError('原文件大小与已接受分片不匹配，不能续传', 600)
  }
  return chunkSize
}

export function createUploadQueue(deps: QueueDependencies) {
  const tasks = reactive<LocalUploadTask[]>([])
  const files = new Map<string, File>()
  const controllers = new Map<string, AbortController>()
  let owner = ''
  let ownerGeneration = 0
  let processingGeneration: number | null = null
  let revision = 0
  const chunkSize = deps.chunkSize || UPLOAD_CHUNK_SIZE
  const key = (id: string) => `netdisk.upload.${owner}.${id}`
  function save(task: LocalUploadTask) {
    if (!task.fileId) return
    try { deps.storage?.setItem(key(task.fileId), JSON.stringify({ fileSize: task.fileSize, chunkSize: task.chunkSize, fileName: task.fileName, filePid: task.filePid, fileMd5: task.fileMd5, chunks: task.chunks } satisfies SavedUpload)) } catch { /* 服务端任务列表仍可恢复。 */ }
  }
  function saved(id: string): SavedUpload | undefined {
    try { const raw = deps.storage?.getItem(key(id)); return raw ? JSON.parse(raw) as SavedUpload : undefined } catch { return undefined }
  }
  function forget(id?: string) { if (id) try { deps.storage?.removeItem(key(id)) } catch { /* 可忽略失效元数据。 */ } }
  function complete(task: LocalUploadTask, status: 'upload_finish' | 'upload_seconds') {
    task.state = 'completed'
    task.uploadStatus = status
    task.confirmedBytes = task.fileSize
    task.inFlightBytes = 0
    task.speed = 0
    task.error = ''
    task.uncertain = false
    forget(task.fileId)
    files.delete(task.localId)
    deps.completed()
  }
  function acceptCompleted(task: LocalUploadTask, detail: ServerUploadTask): boolean {
    if (detail.state !== 'completed') return false
    if (!detail.fileAvailable || !['upload_finish', 'upload_seconds'].includes(detail.uploadStatus || '')) throw new ApiError('原件不可用或完成回执异常，请刷新任务列表', 600)
    complete(task, detail.uploadStatus as 'upload_finish' | 'upload_seconds')
    return true
  }
  async function run(task: LocalUploadTask) {
    const generation = ownerGeneration
    const file = files.get(task.localId)
    if (!file) { task.state = 'error'; task.error = '请选择同一原文件后继续'; return }
    const controller = new AbortController()
    controllers.set(task.localId, controller)
    try {
      if (!task.fileMd5) {
        task.state = 'hashing'
        task.hashProgress = 0
        task.fileMd5 = await deps.hash(file, controller.signal, ratio => { task.hashProgress = Math.round(ratio * 100) })
      }
      if (controller.signal.aborted || generation !== ownerGeneration) return
      let accepted: { index: number; size: number }[] = []
      if (task.fileId) {
        const detail = await deps.api.detail(task.fileId)
        if (controller.signal.aborted || generation !== ownerGeneration) return
        if (detail.fileName !== file.name.normalize('NFC') || detail.filePid !== task.filePid || detail.fileMd5.toLowerCase() !== task.fileMd5.toLowerCase()) throw new ApiError('文件名称、上传目录或完整校验值不匹配，请选择同一原文件', 600)
        if (acceptCompleted(task, detail)) return
        if (detail.state !== 'uploading') throw new ApiError('任务已取消或过期，请重新创建上传', 600)
        task.chunkSize = resumeChunkSize(detail, file, saved(task.fileId))
        task.chunks = detail.chunks
        accepted = detail.receivedChunks
      }
      if (controller.signal.aborted || generation !== ownerGeneration) return
      task.state = 'uploading'
      task.confirmedBytes = accepted.reduce((sum, chunk) => sum + chunk.size, 0)
      task.inFlightBytes = 0
      task.error = ''
      const present = new Set(accepted.map(chunk => chunk.index))
      const missing = Array.from({ length: task.chunks }, (_, index) => index).filter(index => !present.has(index))
      // 全部分片在磁盘但尚未成功合并时，重发末片触发服务端幂等完成。
      const indices = missing.length ? missing : [task.chunks - 1]
      save(task)
      for (const index of indices) {
        if (controller.signal.aborted || generation !== ownerGeneration) return
        const blob = file.slice(index * task.chunkSize, Math.min(file.size, (index + 1) * task.chunkSize))
        const started = performance.now()
        task.submitted = true
        const response = await deps.api.sendChunk({ fileId: task.fileId, fileName: task.fileName, filePid: task.filePid, fileMd5: task.fileMd5, chunks: task.chunks, chunkIndex: index, blob }, controller.signal, bytes => {
          if (controller.signal.aborted) return
          task.inFlightBytes = present.has(index) ? 0 : bytes
          task.speed = bytes / Math.max(.1, (performance.now() - started) / 1000)
        })
        if (generation !== ownerGeneration) return
        if (task.fileId && task.fileId !== response.fileId) throw new ApiError('服务器返回了不同任务编号，已停止上传', 0)
        task.fileId = response.fileId
        task.uncertain = false
        save(task)
        if (response.status === 'upload_finish' || response.status === 'upload_seconds') { complete(task, response.status); return }
        if (!present.has(index)) { task.confirmedBytes += blob.size; present.add(index) }
        task.inFlightBytes = 0
        if (controller.signal.aborted || task.state !== 'uploading') return
      }
      throw new ApiError('服务端尚未确认完成，请重试以检查并继续任务', 0)
    } catch (reason) {
      if (generation !== ownerGeneration) return
      if (!task.fileId && task.submitted) task.uncertain = true
      if (task.state === 'cancelling' || task.state === 'cancelled') return
      if (controller.signal.aborted || (reason instanceof Error && reason.name === 'AbortError')) {
        task.state = 'paused'
        if (task.uncertain) task.error = '首片结果尚未确认，请刷新服务器任务列表，找到任务后继续或取消。'
      } else {
        task.state = 'error'
        task.error = (reason instanceof Error ? reason.message : '上传失败，请重试') + (task.uncertain ? ' 首片可能已接受，请刷新服务器任务列表确认，避免重复新建。' : '')
      }
    } finally {
      controllers.delete(task.localId)
      task.inFlightBytes = 0
      task.speed = 0
    }
  }
  async function pump() {
    const generation = ownerGeneration
    if (processingGeneration === generation) return
    processingGeneration = generation
    try {
      let next = tasks.find(task => task.state === 'queued')
      while (next && generation === ownerGeneration) { await run(next); next = tasks.find(task => task.state === 'queued') }
    } finally { if (processingGeneration === generation) processingGeneration = null }
  }
  function add(filesToAdd: File[], filePid: string, destinationName: string) {
    if (!owner) throw new ApiError('请先登录', 901)
    for (const file of filesToAdd) {
      const nameError = validateFileName(file.name.normalize('NFC'))
      if (nameError) throw new ApiError(`${file.name}：${nameError}`, 600)
      if (Math.max(1, Math.ceil(file.size / chunkSize)) > 10000) throw new ApiError(`${file.name} 超过当前客户端允许的分片数量`, 600)
    }
    for (const file of filesToAdd) {
      const localId = `${Date.now()}-${++revision}`
      const task: LocalUploadTask = { localId, fileName: file.name.normalize('NFC'), filePid, destinationName, fileSize: file.size, chunkSize, chunks: Math.max(1, Math.ceil(file.size / chunkSize)), fileMd5: '', state: 'queued', hashProgress: 0, confirmedBytes: 0, inFlightBytes: 0, speed: 0, error: '', uncertain: false, submitted: false }
      files.set(localId, file)
      tasks.push(task)
    }
    void pump()
  }
  function pause(localId: string) {
    const task = tasks.find(item => item.localId === localId)
    if (!task || !['queued', 'hashing', 'uploading'].includes(task.state)) return
    task.state = 'paused'
    controllers.get(localId)?.abort()
  }
  function resume(localId: string) {
    const task = tasks.find(item => item.localId === localId)
    if (!task || !['paused', 'error'].includes(task.state) || task.uncertain || controllers.has(localId)) return
    task.error = ''
    task.state = 'queued'
    void pump()
  }
  async function resumeServer(server: ServerUploadTask, file: File, expectedFilePid: string) {
    if (!owner) throw new ApiError('请先登录', 901)
    if (server.fileName !== file.name.normalize('NFC') || server.filePid !== expectedFilePid) throw new ApiError('文件名称或上传目录不匹配，请选择任务的原文件', 600)
    const known = saved(server.fileId)
    if (known && known.fileSize !== file.size) throw new ApiError('文件大小不匹配，请选择任务的原文件', 600)
    const active = tasks.find(item => item.fileId === server.fileId && !['completed', 'cancelled'].includes(item.state))
    if (active && ['queued', 'hashing', 'uploading', 'cancelling'].includes(active.state)) throw new ApiError('这个任务正在当前页面处理中', 600)
    if (active) { controllers.get(active.localId)?.abort(); tasks.splice(tasks.indexOf(active), 1); files.delete(active.localId) }
    for (const uncertain of [...tasks]) {
      if (uncertain.uncertain && uncertain.fileName === server.fileName && uncertain.filePid === server.filePid && uncertain.fileMd5 === server.fileMd5) {
        tasks.splice(tasks.indexOf(uncertain), 1); files.delete(uncertain.localId)
      }
    }
    const localId = `${Date.now()}-${++revision}`
    files.set(localId, file)
    const task: LocalUploadTask = { localId, fileId: server.fileId, fileName: server.fileName, filePid: server.filePid, destinationName: server.filePid === '0' ? '全部文件' : '任务原目录', fileSize: file.size, chunkSize: known?.chunkSize || chunkSize, chunks: server.chunks, fileMd5: '', state: 'queued', hashProgress: 0, confirmedBytes: 0, inFlightBytes: 0, speed: 0, error: '', uncertain: false, submitted: true }
    tasks.push(task)
    void pump()
  }
  async function cancel(localId: string) {
    const generation = ownerGeneration
    const task = tasks.find(item => item.localId === localId)
    if (!task || ['completed', 'cancelled', 'cancelling'].includes(task.state)) return
    pause(localId)
    if (!task.fileId) {
      if (task.submitted) { task.uncertain = true; task.error = '首片结果未确认，无法保证释放服务器空间。请刷新服务器任务列表并取消对应任务。'; throw new ApiError(task.error, 0) }
      task.state = 'cancelled'; files.delete(localId); return
    }
    task.state = 'cancelling'
    try {
      const result = await deps.api.cancel(task.fileId)
      if (generation !== ownerGeneration) return
      if (result.state !== 'cancelled' && result.state !== 'expired') throw new ApiError('服务器尚未确认取消，请刷新任务状态', 0)
      task.state = 'cancelled'; task.error = ''; task.uncertain = false
      task.confirmedBytes = 0; task.inFlightBytes = 0
      forget(task.fileId); files.delete(localId)
    } catch (reason) {
      if (generation !== ownerGeneration) return
      task.state = 'error'
      task.error = reason instanceof Error ? reason.message : '取消失败，临时空间可能仍被占用'
      try { const detail = await deps.api.detail(task.fileId); if (generation !== ownerGeneration) return; if (acceptCompleted(task, detail)) return } catch { /* 保留取消失败原因，供重试。 */ }
      throw reason
    }
  }
  function setOwner(value: string) {
    if (owner === value) return
    ownerGeneration++
    for (const controller of controllers.values()) controller.abort()
    controllers.clear(); files.clear(); tasks.splice(0)
    owner = value
  }
  return { tasks, add, pause, resume, resumeServer, cancel, setOwner }
}

let singleton: ReturnType<typeof createUploadQueue> | undefined
export function useUploadQueue() {
  if (!singleton) {
    let storage: Storage | undefined
    try { storage = localStorage } catch { /* 任务仍可通过服务器恢复。 */ }
    singleton = createUploadQueue({ api: uploadsApi, hash: hashFile, storage, completed: () => {
      window.dispatchEvent(new Event(FILES_CHANGED_EVENT))
      void useAccount().refreshSpace()
    } })
  }
  return singleton
}

export function uploadPercent(task: LocalUploadTask): number {
  if (task.state === 'completed') return 100
  if (!task.fileSize) return 0
  return Math.min(99, Math.floor((task.confirmedBytes + task.inFlightBytes) / task.fileSize * 100))
}
