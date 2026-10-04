import { baseUrl, postForm, request } from './client'
import type { FileItem, FileListQuery, FilePage } from '../types/files'

function queryString(fields: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') query.set(key, String(value))
  return query.toString()
}

export const filesApi = {
  list: (fields: FileListQuery, signal?: AbortSignal) => request<FilePage>(`/file/loadDataList?${queryString({ ...fields })}`, { signal }),
  breadcrumbs: (path: string, signal?: AbortSignal) => request<FileItem[]>(`/file/getFolderInfo?${queryString({ path })}`, { signal }),
  folders: (filePid: string, currentFileIds: string[], signal?: AbortSignal) => request<FileItem[]>(`/file/loadAllFolder?${queryString({ filePid, currentFileIds: currentFileIds.join(',') })}`, { signal }),
  createFolder: (filePid: string, fileName: string) => postForm<FileItem>('/file/newFolder', { filePid, fileName }),
  rename: (fileId: string, fileName: string) => postForm<FileItem>('/file/rename', { fileId, fileName }),
  move: (fileIds: string[], filePid: string) => postForm<null>('/file/changeFileFolder', { fileIds: fileIds.join(','), filePid }),
  recycle: (fileIds: string[]) => postForm<null>('/file/delFile', { fileIds: fileIds.join(',') }),
  downloadCode: (fileId: string) => postForm<string>(`/file/createDownloadUrl/${encodeURIComponent(fileId)}`, {}),
}

export function downloadUrl(code: string): string { return `${baseUrl}/file/download/${encodeURIComponent(code)}` }
