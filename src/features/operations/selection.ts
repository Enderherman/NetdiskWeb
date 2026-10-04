import { ApiError } from '../../api/client'
import { validateFileName } from '../../composables/filePresentation'
import type { FileItem } from '../../types/files'

export function validFileId(value: unknown, root = false): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,10}$/.test(value) && (root || value !== '0')
}

/** 同一用户跨目录选择合法；不能把不一致的同 ID 快照或其他用户条目混在一起。 */
export function normalizeSelection(files: readonly FileItem[], ownerId: string): FileItem[] {
  if (!ownerId) throw new ApiError('请先登录后操作文件', 901)
  if (!files.length || files.length > 1000) throw new ApiError('请选择 1–1000 个文件或文件夹', 600)
  const values = new Map<string, FileItem>()
  for (const file of files) {
    const metadata = file as FileItem & { userId?: unknown; delFlag?: unknown }
    if (metadata.userId !== undefined && metadata.userId !== ownerId) throw new ApiError('不能混合不同用户的文件', 600)
    if (!validFileId(file.fileId) || !validFileId(file.filePid, true) || typeof file.fileName !== 'string' || validateFileName(file.fileName)) {
      throw new ApiError('选择中含无效名称或目录标识，请刷新列表后重试', 600)
    }
    if (![0, 1].includes(file.folderType) || file.status !== 2 || (metadata.delFlag !== undefined && metadata.delFlag !== 2)) {
      throw new ApiError('仅能操作正常且已完成处理的文件或文件夹', 600)
    }
    if (file.folderType === 0 && (file.fileSize === null || !Number.isSafeInteger(file.fileSize) || file.fileSize < 0)) {
      throw new ApiError('文件大小尚不可确认，请刷新列表后重试', 600)
    }
    const previous = values.get(file.fileId)
    if (previous && [previous.filePid, previous.fileName, previous.folderType, previous.status, previous.fileSize].join('\0')
      !== [file.filePid, file.fileName, file.folderType, file.status, file.fileSize].join('\0')) {
      throw new ApiError('同一文件出现了不同位置或内容快照，请重新选择', 600)
    }
    if (!previous) values.set(file.fileId, { ...file })
  }
  return [...values.values()]
}

export function selectionIds(ids: readonly string[]): string[] {
  if (!ids.length || ids.length > 1000 || ids.some(id => !validFileId(id))) throw new ApiError('文件选择参数无效', 600)
  return [...new Set(ids)]
}
