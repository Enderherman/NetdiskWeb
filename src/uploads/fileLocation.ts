import { ApiError, request } from '../api/client'
import { filesApi } from '../api/files'
import { locateRecentFile, validId } from '../features/recent/api'
import type { FileLocation } from '../features/recent/api'
import type { ServerUploadTask } from '../types/uploads'

export interface UploadSearchLocation { path: '/drive'; query: { q: string } }
const validName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value)
export function uploadSearchLocation(task: ServerUploadTask): UploadSearchLocation | null {
  const name = validName(task.actualFileName) ? task.actualFileName : task.fileName
  return validName(name) ? { path: '/drive', query: { q: name } } : null
}

/** 获取最新任务及真实文件条目，再复用最近文件的父链/分页定位，不补造文件元数据。 */
export async function locateUploadedFile(snapshot: ServerUploadTask, signal?: AbortSignal,
  updated?: (task: ServerUploadTask) => void): Promise<FileLocation | UploadSearchLocation> {
  if (!validId(snapshot.fileId)) throw new ApiError('上传记录无效，请刷新服务器任务', 600)
  const task = await request<ServerUploadTask>(`/file/uploadTask/${encodeURIComponent(snapshot.fileId)}`, { signal })
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
  if (!task || task.fileId !== snapshot.fileId || !validId(task.filePid, true) || !validName(task.fileName)
    || typeof task.fileAvailable !== 'boolean' || !['uploading', 'completed', 'cancelled', 'expired'].includes(task.state)) {
    throw new ApiError('上传记录响应异常，请刷新后重试', 0)
  }
  updated?.(task)
  if (task.state !== 'completed' || !task.fileAvailable) throw new ApiError('原件当前不可用，可能已移入回收站或删除', 600)
  const fallback = uploadSearchLocation(task)
  // 旧后端没有当前名称/目录字段。原 filePid 是上传时目录，不能声称它仍是当前位置。
  if (task.actualFileName === undefined && task.navigationPath === undefined) {
    if (!fallback) throw new ApiError('没有可用于搜索的文件名称，请刷新任务', 600)
    return fallback
  }
  if (task.actualFileName != null && !validName(task.actualFileName)) throw new ApiError('当前文件名称响应异常，请刷新任务', 0)
  let filePid: string | undefined
  if (task.navigationPath === '0') filePid = '0'
  else if (task.navigationPath != null) {
    if (typeof task.navigationPath !== 'string') throw new ApiError('当前目录路径响应异常，请刷新任务', 0)
    const ids = task.navigationPath.split('/')
    if (ids.length > 100 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length || ids.includes(task.fileId)) {
      throw new ApiError('当前目录路径异常，请刷新任务后重试', 600)
    }
    filePid = ids[ids.length - 1]
  }
  if (!fallback) throw new ApiError('没有可用于定位的文件名称，请刷新任务', 600)
  // 名称只缩小候选范围，必须按 fileId 核对真实条目；移动或重名不会选错同名文件。
  for (let pageNo = 1; pageNo <= 100; pageNo++) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const page = await filesApi.list({ category: 'all', ...(filePid !== undefined ? { filePid } : {}),
      fileNameFuzzy: fallback.query.q, pageNo, pageSize: 100, sortField: 'lastUpdateTime', sortDirection: 'desc' }, signal)
    if (!page || !Array.isArray(page.list) || !Number.isInteger(page.pageNo) || page.pageNo < 1
      || !Number.isInteger(page.pageTotal) || page.pageTotal < page.pageNo) throw new ApiError('文件列表响应异常，请重试定位', 0)
    const file = page.list.find(item => item?.fileId === task.fileId)
    if (file) {
      if (!validId(file.filePid, true) || file.folderType !== 0 || file.status !== 2 || !validName(file.fileName)) {
        throw new ApiError('原件当前不可用，请刷新服务器任务', 600)
      }
      try { return await locateRecentFile(file, signal) }
      catch (reason) {
        if (reason instanceof ApiError) throw new ApiError(reason.message.replaceAll('最近列表', '服务器任务'), reason.code)
        throw reason
      }
    }
    if (page.pageNo !== pageNo || page.pageNo >= page.pageTotal) break
  }
  throw new ApiError('文件位置或名称已变化，或超出定位范围；请刷新任务重试，也可按名称搜索', 600)
}
