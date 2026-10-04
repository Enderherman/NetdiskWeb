import { ApiError, baseUrl, postForm } from '../../api/client'
import { filesApi } from '../../api/files'
import type { FileItem } from '../../types/files'
import { selectionIds, validFileId } from './selection'

export const operationsApi = {
  async copy(ids: readonly string[], filePid: string): Promise<FileItem[]> {
    const fileIds = selectionIds(ids)
    if (!validFileId(filePid, true)) throw new ApiError('目标目录无效', 600)
    const items = await postForm<FileItem[]>('/file/copyFile', { fileIds: fileIds.join(','), filePid })
    const newIds = new Set<string>()
    if (!Array.isArray(items) || !items.length || items.length > fileIds.length || items.some(item => {
      if (!item || !validFileId(item.fileId) || newIds.has(item.fileId) || fileIds.includes(item.fileId)
        || item.filePid !== filePid || typeof item.fileName !== 'string' || ![0, 1].includes(item.folderType) || item.status !== 2) return true
      newIds.add(item.fileId); return false
    })) throw new ApiError('复制已提交，但新条目信息不完整，请刷新目标目录核对', 0)
    return items.map(item => ({ fileId: item.fileId, filePid: item.filePid, fileName: item.fileName, fileSize: item.fileSize,
      folderType: item.folderType, fileCategory: item.fileCategory, fileType: item.fileType, status: item.status,
      lastUpdateTime: item.lastUpdateTime, fileCover: item.fileCover }))
  },
  async zipCode(ids: readonly string[]): Promise<string> {
    const code = await postForm<string>('/file/createZipDownloadUrl', { fileIds: selectionIds(ids).join(',') })
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw new ApiError('ZIP 下载授权响应异常，请重新发起', 0)
    return code
  },
}

export function zipDownloadUrl(code: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new ApiError('ZIP 下载授权无效', 600)
  return `${baseUrl}/file/downloadZip/${encodeURIComponent(code)}`
}

export async function validateCopyDestination(destination: string, selectedFolders: ReadonlySet<string>, signal?: AbortSignal): Promise<void> {
  if (!validFileId(destination, true)) throw new ApiError('目标目录无效', 600)
  const visited = new Set<string>()
  let current = destination
  while (current !== '0') {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    if (selectedFolders.has(current)) throw new ApiError('不能将目录复制到自身或其子目录', 600)
    if (visited.has(current) || visited.size >= 100) throw new ApiError('目标目录路径异常，请重新选择', 600)
    visited.add(current)
    const result = await filesApi.breadcrumbs(current, signal)
    if (!Array.isArray(result) || result.length !== 1 || result[0]?.fileId !== current || result[0].folderType !== 1
      || result[0].status !== 2 || !validFileId(result[0].filePid, true)) throw new ApiError('目标目录已不可用，请重新选择', 600)
    current = result[0].filePid
  }
}
