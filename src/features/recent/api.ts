import { ApiError, request } from '../../api/client'
import { filesApi } from '../../api/files'
import type { FileItem, FilePage } from '../../types/files'

function validatePage(value: FilePage): FilePage {
  if (!value || !Array.isArray(value.list) || !Number.isInteger(value.totalCount) || value.totalCount < 0
    || !Number.isInteger(value.pageNo) || value.pageNo < 1 || !Number.isInteger(value.pageTotal) || value.pageTotal < value.pageNo) {
    throw new ApiError('文件列表响应异常，请重新读取', 0)
  }
  return value
}
export function validId(value: unknown, root = false): value is string { return typeof value === 'string' && /^[A-Za-z0-9]{1,10}$/.test(value) && (root || value !== '0') }

export const recentApi = {
  async list(pageNo = 1, pageSize = 20, signal?: AbortSignal): Promise<FilePage> {
    if (!Number.isInteger(pageNo) || pageNo < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApiError('页码或每页数量无效', 600)
    const result = validatePage(await request<FilePage>(`/file/recent?${new URLSearchParams({ pageNo: String(pageNo), pageSize: String(pageSize) })}`, { signal }))
    if (result.list.some(file => !file || !validId(file.fileId) || !validId(file.filePid, true)
      || typeof file.fileName !== 'string' || file.folderType !== 0 || file.status !== 2)) throw new ApiError('最近文件响应异常，请重新读取', 0)
    return { ...result, list: result.list.map(file => ({ fileId: file.fileId, filePid: file.filePid, fileName: file.fileName,
      fileSize: file.fileSize, folderType: file.folderType, fileCategory: file.fileCategory, fileType: file.fileType,
      status: file.status, lastUpdateTime: file.lastUpdateTime, fileCover: file.fileCover })) }
  },
  async folderCount(filePid: string, signal?: AbortSignal): Promise<number> {
    const query = new URLSearchParams({ filePid, category: 'all', folderType: '1', pageNo: '1', pageSize: '1', sortField: 'lastUpdateTime', sortDirection: 'desc' })
    return validatePage(await request<FilePage>(`/file/loadDataList?${query}`, { signal })).totalCount
  },
  async directory(filePid: string, pageNo: number, signal?: AbortSignal): Promise<FilePage> {
    return validatePage(await filesApi.list({ filePid, category: 'all', pageNo, pageSize: 100,
      sortField: 'lastUpdateTime', sortDirection: 'desc' }, signal))
  },
}

export interface FileLocation { path: '/drive'; query: { path?: string; page: string; size: '100'; sort: 'lastUpdateTime'; direction: 'desc'; focus: string } }

/** 核对完整父链和目标实际分页，避免只跳第一页却声称已定位。 */
export async function locateRecentFile(file: FileItem, signal?: AbortSignal): Promise<FileLocation> {
  if (!validId(file.fileId) || !validId(file.filePid, true) || file.folderType !== 0) throw new ApiError('文件位置无效，请刷新最近列表', 600)
  const ids: string[] = []
  const visited = new Set<string>([file.fileId])
  let current = file.filePid
  while (current !== '0') {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    if (visited.has(current) || ids.length >= 100) throw new ApiError('目录路径异常，请刷新后重试', 600)
    visited.add(current)
    const folders = await filesApi.breadcrumbs(current, signal)
    if (!Array.isArray(folders) || folders.length !== 1 || folders[0]?.fileId !== current || folders[0].folderType !== 1
      || folders[0].status !== 2 || !validId(folders[0].filePid, true)) throw new ApiError('上级目录已不可用，请刷新最近列表', 600)
    ids.unshift(current); current = folders[0].filePid
  }
  const folderCount = await recentApi.folderCount(file.filePid, signal)
  // 普通列表目录优先。跳过只含目录的分页，再按与目标页面一致的排序查找文件。
  const first = Math.floor(folderCount / 100) + 1
  for (let requested = first; requested < first + 100; requested++) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const page = await recentApi.directory(file.filePid, requested, signal)
    if (page.list.some(item => item.fileId === file.fileId && item.filePid === file.filePid && item.folderType === 0)) {
      return { path: '/drive', query: { ...(ids.length ? { path: ids.join('/') } : {}), page: String(page.pageNo), size: '100',
        sort: 'lastUpdateTime', direction: 'desc', focus: file.fileId } }
    }
    if (page.pageNo !== requested || page.pageNo >= page.pageTotal) throw new ApiError('文件位置已变化，请刷新最近列表后重试', 600)
  }
  throw new ApiError('此目录文件较多，暂时无法定位；请从我的文件中打开目录查找', 600)
}
